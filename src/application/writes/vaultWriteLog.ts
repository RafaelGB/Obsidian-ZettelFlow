/**
 * What ZettelFlow wrote, kept as a fact (#453, epic #451) — pure.
 *
 * ZettelFlow writes to your vault in a dozen places and, until now, kept no account of it: a note
 * here, a satellite there, frontmatter on a note you were not looking at, a canvas moved into a
 * folder. The answer to *"what did that flow just do?"* was to open the notes and look, and the
 * answer to *"take it back"* was `Ctrl+Z` in the one note you had focused.
 *
 * So every write leaves a record. This module is the record and its two limits, and nothing else:
 * no vault, no Obsidian, no clock of its own.
 *
 * Two rules give it its shape:
 *
 * - **No note content, ever.** A created note is taken back by moving it to the trash, which needs
 *   no copy of the body. A property change keeps only the keys it touched, with their old and new
 *   values, because that is exactly what restoring them needs. A record that held bodies would be
 *   a second copy of your vault with none of its protections.
 * - **A week, and a ceiling.** Time is the policy; the entry cap is the safety net for a vault
 *   whose hooks fire all day. Whichever comes first.
 *
 * The **batch** is the idea that makes undo possible: a note, its satellite and the two properties
 * one flow set share a batch id, so they can be taken back as the one thing they always were.
 */

import type { WriteOrigin } from "./writeAttribution";

/**
 * The kinds of change worth recording.
 *
 * Four of them undo knows how to reverse. `content-replaced` is the honest exception: overwriting
 * a file can only be undone by keeping the old body, and keeping bodies is the one thing this
 * record refuses to do. It is still recorded — *what ZettelFlow changed* is a question worth
 * answering even where *take it back* has no answer.
 */
export type WriteKind =
    | "note-created"
    | "file-created"
    | "file-moved"
    | "properties-set"
    | "content-appended"
    | "content-replaced";

/** The kinds an undo can reverse. `content-replaced` is deliberately not one of them. */
export const UNDOABLE_KINDS: readonly WriteKind[] = [
    "note-created",
    "file-created",
    "file-moved",
    "properties-set",
    "content-appended",
];

/** Whether this particular change can be taken back at all. */
export function isUndoableKind(kind: WriteKind): boolean {
    return UNDOABLE_KINDS.includes(kind);
}

export interface VaultWrite {
    id: string;
    /** Everything one action did shares this: a note, its satellite, the properties set on it. */
    batch: string;
    /** Unix ms. */
    at: number;
    kind: WriteKind;
    path: string;
    /** Where a moved file came from. */
    from?: string;
    origin: WriteOrigin;
    /** Only for `properties-set`: the touched keys as they were. What restoring them needs. */
    before?: Record<string, unknown>;
    /** Only for `properties-set`: the touched keys as they were left. What tells us they still are. */
    after?: Record<string, unknown>;
    /** Only for `content-appended`: the text added, so it can be removed again. */
    appended?: string;
    /** Unix ms of when this write was taken back. */
    undone?: number;
}

/**
 * How long a write stays on the record (#511).
 *
 * It was **a week**, because a panel read it: *What ZettelFlow changed* listed batches, kinds and
 * origins, and a week was how far back you could look. Nobody opened it — and every thought typed
 * in the Lab landed here too, so an afternoon of thinking could evict the flow writes you would
 * actually want to take back.
 *
 * The panel is gone. The record's only reader is now the thirty-second undo offer, so it has to
 * outlive an offer and nothing more: two minutes, in memory, never written to disk. That deletes
 * the retention policy, the settings field, the migration and `data.json` growth in one move.
 */
export const WRITE_WINDOW_MS = 2 * 60_000;

/** A burst from one flow, not a day of work. The buffer is transient; this is only a ceiling. */
export const MAX_WRITES = 200;

export interface WriteRetention {
    /** Injected, so a test does not have to wait. */
    now: number;
}

/** Drop what is past the window, then anything past the ceiling. Oldest goes first, both times. */
export function pruneWrites(writes: VaultWrite[], { now }: WriteRetention): VaultWrite[] {
    const kept = writes.filter((write) => write.at >= now - WRITE_WINDOW_MS);
    return kept.length > MAX_WRITES ? kept.slice(0, MAX_WRITES) : kept;
}

/** Newest first, pruned as it goes — the append is the only place the record grows. */
export function appendWrite(
    writes: VaultWrite[],
    write: VaultWrite,
    retention: WriteRetention
): VaultWrite[] {
    return pruneWrites([write, ...writes], retention);
}

export interface WriteFilter {
    batch?: string;
    kind?: WriteKind;
    path?: string;
    /** Only what has not been taken back yet. */
    pendingOnly?: boolean;
}

export function filterWrites(writes: VaultWrite[], filter: WriteFilter): VaultWrite[] {
    return writes.filter((write) => {
        if (filter.batch && write.batch !== filter.batch) return false;
        if (filter.kind && write.kind !== filter.kind) return false;
        if (filter.path && write.path !== filter.path) return false;
        if (filter.pendingOnly && write.undone !== undefined) return false;
        return true;
    });
}

/** The property names a write changed — the whole of what a property write is about. */
export function touchedProperties(write: VaultWrite): string[] {
    if (write.kind !== "properties-set") return [];
    return Object.keys(write.after ?? write.before ?? {});
}

/** An empty record. Clearing is a decision, so it is stated rather than inlined as `[]`. */
export function clearWrites(): VaultWrite[] {
    return [];
}
