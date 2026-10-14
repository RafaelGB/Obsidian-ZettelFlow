import { TFile, TFolder, type WorkspaceLeaf } from "obsidian";
import { log } from "architecture";
import { FileService } from "architecture/plugin/services/FileService";
import { undoBatch } from "architecture/plugin/writes/undoNotice";
import type ZettelFlow from "main";
import { canonicalHash, dropInstall, type InstalledSystem } from "./installRecord";
import { COMMUNITY_VIEW } from "./view/communityRooms";

/**
 * **Undo an install, exactly** (#799 FR-15, epic #797).
 *
 * The notice after installing offers *Undo*. It takes the install back as the one thing it was:
 * the files the batch created go to Obsidian's trash through the write record (#453), the role's
 * setting gets back what it held before, the record entry goes, and a tab that is still showing the
 * installed canvas goes back to Community on Systems.
 *
 * The write record refuses a file whose mtime moved after the write — and Obsidian opening the
 * canvas in this very tab can do that. So a file the batch could not take back is checked against
 * the hash taken at install: unchanged, it is trashed all the same; changed, it is **kept**, and
 * named. S6's *Remove* reuses this, once the batch is long gone.
 */

export interface UndoInstallResult {
    removed: string[];
    /** Files you changed since the install: kept, and named. */
    kept: string[];
    failed: string[];
    /** Whether the role setting got its previous value back. */
    settingRestored: boolean;
}

export async function undoInstall(plugin: ZettelFlow, record: InstalledSystem, leaf?: WorkspaceLeaf): Promise<UndoInstallResult> {
    const result: UndoInstallResult = { removed: [], kept: [], failed: [], settingRestored: false };
    const vault = plugin.app.vault;

    // The setting first, while it still points at this install's canvas: trashing the canvas makes
    // the role follow its file away (#712), and the flow it displaced would never come back. A flow
    // you chose since is yours, and stays.
    const setting = record.setting;
    if (setting && plugin.settings[setting.key] === setting.value) {
        plugin.settings[setting.key] = setting.previous;
        result.settingRestored = true;
    }

    if (record.batch) {
        try {
            await undoBatch(record.batch);
        } catch (error) {
            log.warn("[install] the write record could not take the batch back", error);
        }
    }

    for (const { path, hash } of record.files) {
        const file = vault.getFileByPath(path);
        if (!(file instanceof TFile)) {
            result.removed.push(path);
            continue;
        }
        try {
            const content = await vault.read(file);
            if (canonicalHash(path, content) !== hash) {
                result.kept.push(path);
                continue;
            }
            await FileService.deleteFile(file);
            result.removed.push(path);
        } catch (error) {
            log.error(`[install] could not take back ${path}`, error);
            result.failed.push(path);
        }
    }

    // The folders it made, deepest first, and only those now empty.
    for (const path of [...record.folders].sort((a, b) => b.length - a.length)) {
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
