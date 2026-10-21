import { TFile, TFolder } from "obsidian";
import { log, ObsidianApi } from "architecture";
import { FileService } from "architecture/plugin/services/FileService";
import { FrontmatterService } from "architecture/plugin/services/FrontmatterService";
import { currentWriteBatch, withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { BOOK_LINK_KEY } from "application/library/bookNote";
import { archiveTarget, bookLinkResolver, normalizeArchiveRecords, relinkBook, returnTarget, type ArchiveRecord, type ArchiveRecords } from "application/library/archive";
import type { ShelfItem } from "application/library/shelf";

/**
 * **The archive, written** (#865) — every archive, return and move of the archive is **one recorded
 * batch**, taken back by one Undo. The file is moved through `FileService.moveFile`, never changed;
 * a book's note is touched only when its `book` link no longer finds the book (FR-24), through
 * `FrontmatterService`, in the same batch. Where each thing came from is plugin data, written after
 * the move — a failed move remembers nothing.
 */

/** The vault, as the archive needs it — injectable so a test can watch it without one. */
export interface ArchivePort {
    file(path: string): TFile | null;
    folderExists(path: string): boolean;
    exists(path: string): boolean;
    createFolder(path: string): Promise<void>;
    move(file: TFile, to: string): Promise<void>;
    /** Make the note at `note` link to the book at `to`, when its link no longer finds it. */
    relink(note: string, to: string): Promise<void>;
}

export const realArchivePort: ArchivePort = {
    file: (path) => {
        const file = ObsidianApi.vault().getAbstractFileByPath(path);
        return file instanceof TFile ? file : null;
    },
    folderExists: (path) => ObsidianApi.vault().getAbstractFileByPath(path) instanceof TFolder,
    exists: (path) => ObsidianApi.vault().getAbstractFileByPath(path) !== null,
    createFolder: async (path) => {
        await ObsidianApi.vault().createFolder(path);
    },
    move: (file, to) => FileService.moveFile(file, to),
    relink: async (note, to) => {
        const file = ObsidianApi.vault().getAbstractFileByPath(note);
        if (!(file instanceof TFile)) return;
        const cache = ObsidianApi.metadataCache();
        const resolve = bookLinkResolver(
            (path) => {
                const exact = ObsidianApi.vault().getAbstractFileByPath(path);
                return exact instanceof TFile ? exact.path : null;
            },
            (link) => cache.getFirstLinkpathDest(link, file.path)?.path ?? null
        );
        // What the cache already says Obsidian updated is not written again.
        const frontmatter: Record<string, unknown> | undefined = cache.getFileCache(file)?.frontmatter;
        const cached = frontmatter?.[BOOK_LINK_KEY];
        if (relinkBook(cached, to, resolve) === null) return;
        await FrontmatterService.instance(file).update((frontmatter) => {
            const next = relinkBook(frontmatter[BOOK_LINK_KEY], to, resolve);
            if (next) frontmatter[BOOK_LINK_KEY] = next;
        });
    },
};

/** What the archive keeps in plugin data, and the one way to save it. */
export interface ArchiveHost {
    settings: { libraryArchive?: ArchiveRecords };
    saveSettings(): Promise<void>;
}

/** A move the archive made: the batch to take it back, and where the file is now. */
export interface ArchiveMove {
    batch: string | undefined;
    to: string;
    /** What was remembered of it before the move (a return), so an Undo can give it back. */
    record?: ArchiveRecord;
}

async function ensureFolder(port: ArchivePort, folder: string): Promise<void> {
    if (!folder || port.folderExists(folder)) return;
    await port.createFolder(folder);
}

/**
 * Move one file, and keep its book note pointing at it. Only the move can fail the archive: a link that
 * could not be rewritten is said in the log, and the file has moved.
 */
async function moveWithNote(port: ArchivePort, item: Pick<ShelfItem, "kind" | "note">, file: TFile, to: string): Promise<void> {
    await port.move(file, to);
    if (!item.note || item.kind === "article") return;
    try {
        await port.relink(item.note, to);
    } catch (error) {
        log.error(`[Library] the note ${item.note} could not be pointed at ${to}: ${String(error)}`);
    }
}

/** Remember what changed; a save that fails is said in the log — the move it follows is done. */
async function saveRecords(host: ArchiveHost, change: (records: ArchiveRecords) => void): Promise<void> {
    const records = normalizeArchiveRecords(host.settings.libraryArchive);
    change(records);
    host.settings.libraryArchive = records;
    try {
        await host.saveSettings();
    } catch (error) {
        log.error(`[Library] the archive's records could not be saved: ${String(error)}`);
    }
}

/** Give back what was remembered of an item a return took out of the archive, when the return is undone. */
export async function restoreRecord(path: string, record: ArchiveRecord, host: ArchiveHost): Promise<void> {
    await saveRecords(host, (records) => {
        records[path] = record;
    });
}

/** Put an item away (FR-8–FR-10). Throws when the move fails; nothing is remembered then. */
export async function archiveItem(item: ShelfItem, archive: string, port: ArchivePort, host: ArchiveHost, now = Date.now()): Promise<ArchiveMove> {
    const from = item.file;
    const file = from ? port.file(from) : null;
    if (!from || !file || !archive || item.kind === "path") throw new Error(`[Library] cannot archive ${item.id}`);
    const to = archiveTarget(from, archive, (path) => port.exists(path));
    let batch: string | undefined;
    await withWriteBatch({ kind: "manual", ref: "library-archive", label: from }, async () => {
        batch = currentWriteBatch();
        await ensureFolder(port, archive);
        await moveWithNote(port, item, file, to);
    });
    await saveRecords(host, (records) => {
        records[to] = { from, at: now };
    });
    return { batch, to };
}

/** Take an item back to its shelf (FR-20): `null` when it has nowhere to go (an article, articles off). */
export async function returnItem(item: ShelfItem, articles: string, port: ArchivePort, host: ArchiveHost): Promise<ArchiveMove | null> {
    const from = item.file;
    const file = from ? port.file(from) : null;
    if (!from || !file) throw new Error(`[Library] cannot return ${item.id}`);
    const record = normalizeArchiveRecords(host.settings.libraryArchive)[from];
    const to = returnTarget(from, item.kind, record, { articles, folderExists: (folder) => port.folderExists(folder), exists: (path) => port.exists(path) });
    if (!to) return null;
    let batch: string | undefined;
    await withWriteBatch({ kind: "manual", ref: "library-archive", label: from }, async () => {
        batch = currentWriteBatch();
        await ensureFolder(port, to.includes("/") ? to.slice(0, to.lastIndexOf("/")) : "");
        await moveWithNote(port, item, file, to);
    });
    await saveRecords(host, (records) => {
        delete records[from];
    });
    return { batch, to, ...(record ? { record } : {}) };
}

/**
 * *Move them* (FR-5): every archived item from the old archive folder into the new one, as one batch,
 * each keeping where it came from. Returns the batch. A failure stops the batch where it is.
 */
export async function moveArchive(items: readonly ShelfItem[], to: string, port: ArchivePort, host: ArchiveHost): Promise<string | undefined> {
    // Read before the moves: the rename follow may re-key or drop them while they happen.
    const known = normalizeArchiveRecords(host.settings.libraryArchive);
    const moves: { from: string; to: string }[] = [];
    let batch: string | undefined;
    try {
        await withWriteBatch({ kind: "manual", ref: "library-archive", label: to }, async () => {
            batch = currentWriteBatch();
            await ensureFolder(port, to);
            for (const item of items) {
                const file = item.file ? port.file(item.file) : null;
                if (!file || !item.file) continue;
                const target = archiveTarget(item.file, to, (path) => port.exists(path));
                await moveWithNote(port, item, file, target);
                moves.push({ from: item.file, to: target });
            }
        });
    } finally {
        // What did move keeps its record, whatever stopped the rest.
        await saveRecords(host, (records) => {
            for (const move of moves) {
                const record = known[move.from];
                delete records[move.from];
                if (record) records[move.to] = record;
            }
        });
    }
    return batch;
}

/** *Leave them* (FR-5): forget the records; no file is written. */
export async function forgetArchive(paths: readonly string[], host: ArchiveHost): Promise<void> {
    await saveRecords(host, (records) => {
        for (const path of paths) delete records[path];
    });
}
