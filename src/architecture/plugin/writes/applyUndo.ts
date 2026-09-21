import { TFile } from "obsidian";
import { log } from "architecture/monitoring/Logger";
import { ObsidianApi } from "architecture/plugin/ObsidianAPI";
import { FileService } from "architecture/plugin/services/FileService";
import { FrontmatterService } from "architecture/plugin/services/FrontmatterService";
import type { Literal } from "architecture/plugin/model/FrontmatterModel";
import type { UndoPlan, VaultFacts } from "application/writes/undoPlan";
import type { VaultWrite } from "application/writes/vaultWriteLog";
import { bufferedWrites, replaceBufferedWrites, withoutRecording } from "./recordVaultWrite";

/**
 * The side of undo that touches the vault (#454, epic #451).
 *
 * Everything that *decides* lives in `undoPlan`, which is pure. This module only carries the plan
 * out, and it is deliberately small: four operations, each one reversing a kind of write the
 * record knows about.
 *
 * Nothing here deletes. A note ZettelFlow created goes to **Obsidian's trash**, where the system's
 * own recovery already lives — so the worst outcome of an undo you regret is a trip to the trash
 * folder, not a lost note.
 */

/** What an undo needs to be able to do, as a port — so the plan can be exercised without a vault. */
export interface UndoVault {
    trash(path: string): Promise<void>;
    restore(path: string, before: Record<string, unknown>): Promise<void>;
    move(from: string, to: string): Promise<void>;
    unappend(path: string, text: string): Promise<void>;
}

export interface UndoOutcome {
    done: number;
    /** The paths that could not be reversed, so the result can say so rather than claim success. */
    failed: string[];
}

/**
 * Carry out a plan. One failure does not stop the rest: an undo that gives up halfway without
 * saying so is worse than one that finishes what it can and names what it could not.
 */
export async function applyUndo(plan: UndoPlan, port: UndoVault): Promise<UndoOutcome> {
    const outcome: UndoOutcome = { done: 0, failed: [] };
    const step = async (path: string, work: () => Promise<void>): Promise<void> => {
        try {
            await work();
            outcome.done++;
        } catch (error) {
            log.error(`[undo] could not reverse a write on ${path}`, error);
            outcome.failed.push(path);
        }
    };

    // Properties before notes: a note on its way to the trash does not need its frontmatter put
    // back, but a note that is only having properties restored does.
    for (const entry of plan.restore) {
        await step(entry.path, () => port.restore(entry.path, entry.before));
    }
    for (const entry of plan.unappend) {
        await step(entry.path, () => port.unappend(entry.path, entry.text));
    }
    for (const entry of plan.moveBack) {
        await step(entry.from, () => port.move(entry.from, entry.to));
    }
    for (const path of plan.trash) {
        await step(path, () => port.trash(path));
    }
    return outcome;
}

/**
 * The real vault behind the port.
 *
 * Wrapped in {@link withoutRecording}: putting a note back is not a new thing ZettelFlow did to
 * your vault, and recording it would leave an undo you could undo.
 */
export const obsidianUndoVault: UndoVault = {
    trash: async (path) => {
        const file = ObsidianApi.vault().getFileByPath(path);
        if (file instanceof TFile) await withoutRecording(() => FileService.deleteFile(file));
    },
    restore: async (path, before) => {
        const file = ObsidianApi.vault().getFileByPath(path);
        if (!(file instanceof TFile)) return;
        // A key ZettelFlow added did not exist before, so putting it back means removing it.
        const properties: Record<string, Literal> = {};
        const remove: string[] = [];
        for (const [key, value] of Object.entries(before)) {
            if (value === undefined) remove.push(key);
            else properties[key] = value;
        }
        await withoutRecording(() =>
            FrontmatterService.instance(file).setProperties(properties, remove)
        );
    },
    move: async (from, to) => {
        const file = ObsidianApi.vault().getFileByPath(from);
        if (!(file instanceof TFile)) return;
        const parent = to.slice(0, to.lastIndexOf("/"));
        if (parent && !ObsidianApi.vault().getFolderByPath(parent)) {
            await ObsidianApi.vault().createFolder(parent);
        }
        await withoutRecording(() => FileService.moveFile(file, to));
    },
    unappend: async (path, text) => {
        const file = ObsidianApi.vault().getFileByPath(path);
        if (!(file instanceof TFile)) return;
        const content = await FileService.getContent(file);
        const at = content.lastIndexOf(text);
        if (at === -1) return; // the text is no longer there; leaving it alone is the honest move
        const without = `${content.slice(0, at)}${content.slice(at + text.length)}`.trimEnd();
        await withoutRecording(() => FileService.modify(file, `${without}\n`));
    },
};

/** What the vault looks like right now, for the plan to decide against. */
export function readVaultFacts(writes: VaultWrite[]): VaultFacts {
    const mtimes: Record<string, number> = {};
    const frontmatter: Record<string, Record<string, unknown>> = {};
    for (const write of writes) {
        if (mtimes[write.path] !== undefined) continue;
        const file = ObsidianApi.vault().getFileByPath(write.path);
        if (!(file instanceof TFile)) continue;
        mtimes[write.path] = file.stat.mtime;
        const cached = ObsidianApi.metadataCache().getFileCache(file)?.frontmatter;
        if (cached) frontmatter[write.path] = { ...cached };
    }
    return { mtimes, frontmatter };
}

/** Write the batch off as taken back, so a second offer never appears for an undo that happened. */
export function rememberUndone(batch: string, at: number): void {
    try {
        replaceBufferedWrites(
            bufferedWrites().map((write) => (write.batch === batch ? { ...write, undone: at } : write))
        );
    } catch (error) {
        log.warn("[undo] could not mark the batch as taken back", error);
    }
}
