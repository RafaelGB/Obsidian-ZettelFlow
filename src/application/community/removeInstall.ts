import { TFile, TFolder, type WorkspaceLeaf } from "obsidian";
import { log } from "architecture";
import { FileService } from "architecture/plugin/services/FileService";
import { bufferedWrites } from "architecture/plugin/writes/recordVaultWrite";
import { undoBatch } from "architecture/plugin/writes/undoNotice";
import { WRITE_WINDOW_MS, type VaultWrite } from "application/writes/vaultWriteLog";
import type ZettelFlow from "main";
import { canonicalHash, dropInstall, type InstalledSystem } from "./installRecord";
import { COMMUNITY_VIEW } from "./view/communityRooms";

/**
 * **Taking an install back** (#803 FR-11, #799 FR-15, epic #797 decision 1) — one function for the
 * notice's *Undo* and Installed's *Remove*, in two modes.
 *
 * - **exact** — the install's batch is still on the in-memory write record (#453, two minutes,
 *   #511) and nothing it wrote has changed: the batch is undone through it, and a file it refuses
 *   (Obsidian re-saved the canvas on open, so its mtime moved) is checked against the hash.
 * - **safe** — the batch is gone: the hash is all there is. A file still as installed goes to
 *   Obsidian's trash; a file you changed is **kept**, and named; a file that is gone is skipped.
 *
 * Either way the role's setting gets its previous value back **only while it still points at this
 * install's canvas** — and before anything is trashed, because trashing the canvas makes the role
 * follow its file away (#712). The folders the install made go when they are left empty, and the
 * record entry goes.
 */

export type RemoveMode = "exact" | "safe";

/** What the vault and the write record say right now — everything the plan reads. */
export interface RemoveFacts {
    /** The install's batch is on the write record, not undone, and inside its window. */
    batchLive: boolean;
    /** Each recorded file: whether it is there, and its content hash if it is. */
    files: Record<string, { exists: boolean; hash?: string }>;
    /** What the role's setting holds now. */
    setting?: string;
}

export interface RemovePlan {
    mode: RemoveMode;
    /** Unchanged since install: to the trash. */
    trash: string[];
    /** Changed since install: kept, and named. */
    kept: string[];
    /** Already gone: nothing to do. */
    missing: string[];
    /** The setting still points at this install's canvas. */
    restoreSetting: boolean;
    /** The folders it made, deepest first — each removed only if it is empty by then. */
    folders: string[];
}

/** Pure: what taking `record` back would do, given the facts. */
export function planRemove(record: InstalledSystem, facts: RemoveFacts): RemovePlan {
    const trash: string[] = [];
    const kept: string[] = [];
    const missing: string[] = [];
    for (const { path, hash } of record.files) {
        const fact = facts.files[path];
        if (!fact?.exists) missing.push(path);
        else if (fact.hash === hash) trash.push(path);
        else kept.push(path);
    }
    return {
        // The write record decides by mtime alone; a file whose content you changed is never handed
        // to it, so any change at all makes the take-back go by hash.
        mode: facts.batchLive && record.batch && kept.length === 0 ? "exact" : "safe",
        trash,
        kept,
        missing,
        restoreSetting: !!record.setting && facts.setting === record.setting.value,
        folders: [...record.folders].sort((a, b) => b.length - a.length),
    };
}

/** Pure: whether `batch` can still be undone exactly — on the record, not undone, inside the window. */
export function batchIsLive(batch: string | undefined, writes: readonly VaultWrite[], now: number): boolean {
    if (!batch) return false;
    return writes.some((write) => write.batch === batch && write.undone === undefined && write.at >= now - WRITE_WINDOW_MS);
}

/** Read the facts the plan needs, from the vault and the write record. Writes nothing. */
export async function removeFacts(plugin: ZettelFlow, record: InstalledSystem, now = Date.now()): Promise<RemoveFacts> {
    const vault = plugin.app.vault;
    const files: RemoveFacts["files"] = {};
    for (const { path } of record.files) {
        const file = vault.getFileByPath(path);
        if (!(file instanceof TFile)) {
            files[path] = { exists: false };
            continue;
        }
        try {
            files[path] = { exists: true, hash: canonicalHash(path, await vault.read(file)) };
        } catch (error) {
            // Unreadable is not "as installed": it is kept.
            log.warn(`[install] could not read ${path}`, error);
            files[path] = { exists: true };
        }
    }
    const setting = record.setting ? plugin.settings[record.setting.key] : undefined;
    return { batchLive: batchIsLive(record.batch, bufferedWrites(), now), files, setting: typeof setting === "string" ? setting : undefined };
}

export interface TakeBackResult {
    mode: RemoveMode;
    /** Files that are gone now because of this. */
    removed: string[];
    /** Files you changed since the install: kept, and named. */
    kept: string[];
    failed: string[];
    /** Whether the role setting got its previous value back. */
    settingRestored: boolean;
}

/**
 * Take `record` back. `plan` is the one the caller showed (Installed's *Remove n files*); without it
 * the facts are read now. A tab still showing the installed canvas goes back to Community on Systems.
 */
export async function takeBackInstall(plugin: ZettelFlow, record: InstalledSystem, leaf?: WorkspaceLeaf, plan?: RemovePlan): Promise<TakeBackResult> {
    const steps = plan ?? planRemove(record, await removeFacts(plugin, record));
    const result: TakeBackResult = { mode: steps.mode, removed: [], kept: [], failed: [], settingRestored: false };
    const vault = plugin.app.vault;

    // The setting first, while it still points at this install's canvas (#712).
    if (steps.restoreSetting && record.setting) {
        plugin.settings[record.setting.key] = record.setting.previous;
        result.settingRestored = true;
    }

    if (steps.mode === "exact" && record.batch) {
        try {
            await undoBatch(record.batch);
        } catch (error) {
            log.warn("[install] the write record could not take the batch back", error);
        }
    }

    for (const path of steps.trash) {
        const file = vault.getFileByPath(path);
        // The batch's undo already took it.
        if (!(file instanceof TFile)) {
            result.removed.push(path);
            continue;
        }
        try {
            await FileService.deleteFile(file);
            result.removed.push(path);
        } catch (error) {
            log.error(`[install] could not take back ${path}`, error);
            result.failed.push(path);
        }
    }
    for (const path of steps.kept) {
        if (vault.getFileByPath(path) instanceof TFile) result.kept.push(path);
        else result.removed.push(path);
    }

    for (const path of steps.folders) {
        const folder = vault.getAbstractFileByPath(path);
        if (!(folder instanceof TFolder)) continue;
        try {
            await FileService.trashEmptyFolder(folder);
        } catch (error) {
            log.warn(`[install] could not remove the empty folder ${path}`, error);
        }
    }

    plugin.settings.installedSystems = dropInstall(plugin.settings.installedSystems, record.id);
    await plugin.saveSettings();

    const shown = (leaf?.view as { file?: { path?: string } } | undefined)?.file?.path;
    if (leaf && shown === record.canvas) {
        await leaf.setViewState({ type: COMMUNITY_VIEW, state: { room: "systems" }, active: true });
    }
    return result;
}

/**
 * *Forget it* (#803 FR-12): the record of an install whose canvas is gone, dropped. The vault is not
 * touched — whatever is left of it there is yours.
 */
export async function forgetInstall(plugin: ZettelFlow, id: string): Promise<void> {
    plugin.settings.installedSystems = dropInstall(plugin.settings.installedSystems, id);
    await plugin.saveSettings();
}
