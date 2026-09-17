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
 * A week. Not configurable, deliberately: a run record is a line of text, a write record carries
 * the values it would restore, and the honest way to keep that small is to keep it short.
 */
export const DEFAULT_WRITE_RETENTION_DAYS = 7;

/**
 * The ceiling. Not the policy — retention is by time — but a vault whose hooks fire on every
 * keystroke must not be able to grow `data.json` without bound between two prunes.
 */
export const MAX_WRITES = 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface WriteRetention {
    /** Injected, so a test does not have to wait a week. */
    now: number;
    /** Held at or below {@link DEFAULT_WRITE_RETENTION_DAYS}; a caller cannot ask for longer. */
    retentionDays?: number;
}

function windowDays(retentionDays: number | undefined): number {
    if (!Number.isFinite(retentionDays)) return DEFAULT_WRITE_RETENTION_DAYS;
    return Math.min(DEFAULT_WRITE_RETENTION_DAYS, Math.max(1, Math.round(retentionDays as number)));
}

/** Drop what is older than the window, then anything past the ceiling. Oldest goes first, both times. */
export function pruneWrites(writes: VaultWrite[], { now, retentionDays }: WriteRetention): VaultWrite[] {
    const oldest = now - windowDays(retentionDays) * DAY_MS;
    const kept = writes.filter((write) => write.at >= oldest);
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

/** A batch, as the panel reads it: what it touched, when it started, and whether it is still standing. */
export interface WriteBatch {
    batch: string;
    /** The most recent write in it — batches are listed by when they happened. */
    at: number;
    origin: WriteOrigin;
    writes: VaultWrite[];
    /** True only when every write in the batch was taken back. */
    undone: boolean;
}

/** Group the record into the units it was written in, newest batch first. */
export function batchesOf(writes: VaultWrite[]): WriteBatch[] {
    const order: string[] = [];
    const grouped = new Map<string, VaultWrite[]>();
    for (const write of writes) {
        const existing = grouped.get(write.batch);
        if (existing) {
            existing.push(write);
        } else {
            order.push(write.batch);
            grouped.set(write.batch, [write]);
        }
    }
    return order.map((batch) => {
        const entries = grouped.get(batch) ?? [];
        return {
            batch,
            at: Math.max(...entries.map((entry) => entry.at)),
            origin: entries[0].origin,
            writes: entries,
            // Half a batch taken back is not a batch taken back — the panel must not imply it is.
            undone: entries.every((entry) => entry.undone !== undefined),
        };
    });
}

/** Take a whole batch back at once, leaving every other batch exactly as it was. */
export function markBatchUndone(writes: VaultWrite[], batch: string, at: number): VaultWrite[] {
    return writes.map((write) => (write.batch === batch ? { ...write, undone: at } : write));
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
