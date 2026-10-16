import type { BookChange } from "./bookNote";
import { fold, type ShelfItem, type ShelfStatus } from "./shelf";

/**
 * **Your shelves** (#821, epic #818) — pure: the collections you already had, now shelves you build,
 * fill and filter by. One idea, not two: a shelf of yours *is* a collection, read from and written to
 * the same `collections` a book's note keeps. Nothing here writes; it says what a write would be.
 *
 * - **One place per book.** A book stands on its first shelf of yours, else on the shelf of its
 *   status, else *On the shelf*. Its state still shows on it (the ribbon, the folded corner).
 * - **Membership filters.** Filtering by your shelf shows every book on it, first or not; filtering
 *   by a status shows every book of that status, wherever it stands.
 * - **A move says where you put it** (owner, 2026-10-16): onto your shelf X, X becomes the first of
 *   its shelves and the rest are kept; onto a status shelf, it leaves every shelf of yours and takes
 *   that status. *On the shelf* takes only a book never opened — there is no un-reading a book.
 */

/** Where a book is put, or where a shelf of the Library stands. */
export type ShelfTarget = { kind: "status"; status: ShelfStatus } | { kind: "own"; name: string };

/** A shelf of yours stands for a collection only once something is said of it: remembered, or used. */
export interface ShelfNote {
    path: string;
    article: boolean;
    collections: readonly string[];
}

/** Whether you ever opened it: a place kept, or read to the end. */
export function opened(item: Pick<ShelfItem, "lastRead" | "progress">): boolean {
    return item.lastRead > 0 || item.progress >= 1;
}

/** Where a book stands: its first shelf of yours, else the shelf of its status. */
export function placeOf(item: Pick<ShelfItem, "collections" | "status">): ShelfTarget {
    const first = item.collections?.[0];
    if (first) return { kind: "own", name: first };
    return { kind: "status", status: item.status ?? "none" };
}

/**
 * Your shelves, once each, A→Z: the ones you made (remembered, even empty) and every collection a
 * book is on. The spelling you gave a shelf wins over a note's.
 */
export function yourShelves(remembered: readonly string[], items: readonly Pick<ShelfItem, "collections">[]): string[] {
    const seen = new Map<string, string>();
    for (const name of remembered) if (name.trim() && !seen.has(fold(name))) seen.set(fold(name), name.trim());
    for (const item of items) for (const name of item.collections ?? []) if (name.trim() && !seen.has(fold(name))) seen.set(fold(name), name.trim());
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Whether a book is on your shelf `name` — first or not. */
export function onShelf(item: Pick<ShelfItem, "collections">, name: string): boolean {
    const wanted = fold(name);
    return (item.collections ?? []).some((own) => fold(own) === wanted);
}

/** Whether a book can be put on a shelf: never back on *On the shelf* once it was opened; never a path. */
export function canMoveTo(item: ShelfItem, target: ShelfTarget): boolean {
    if (item.kind === "path" || !item.file) return false;
    if (target.kind === "status" && target.status === "none" && opened(item)) return false;
    return planMove(item, target) !== null;
}

/**
 * What putting a book on a shelf writes — `null` when it is already there (or cannot go there).
 * Only `collections` and `status` are ever in it.
 */
export function planMove(item: ShelfItem, target: ShelfTarget): BookChange | null {
    if (item.kind === "path" || !item.file) return null;
    const current = item.collections ?? [];
    if (target.kind === "own") {
        const wanted = fold(target.name);
        const existing = current.find((name) => fold(name) === wanted);
        if (current.length > 0 && fold(current[0]) === wanted) return null;
        const first = existing ?? target.name.trim();
        return { collections: [first, ...current.filter((name) => fold(name) !== wanted)] };
    }
    const change: BookChange = {};
    if (current.length > 0) change.collections = null;
    if (target.status === "none") {
        if (opened(item)) return null;
        if (item.status) change.status = null;
    } else if (item.status !== target.status) {
        change.status = target.status;
    }
    return Object.keys(change).length > 0 ? change : null;
}

/** One note's shelves, rewritten: what a rename or a delete of a shelf writes. */
export interface ShelfEdit {
    path: string;
    article: boolean;
    collections: string[] | null;
}

/** Rename shelf `from` to `to` in every note that has it, keeping its place in each list. */
export function planRename(notes: readonly ShelfNote[], from: string, to: string): ShelfEdit[] {
    const old = fold(from);
    const next = to.trim();
    const edits: ShelfEdit[] = [];
    for (const note of notes) {
        if (!note.collections.some((name) => fold(name) === old)) continue;
        const renamed: string[] = [];
        for (const name of note.collections) {
            const value = fold(name) === old ? next : name;
            // Renamed onto a shelf it was on too: one place, the earlier.
            if (!renamed.some((kept) => fold(kept) === fold(value))) renamed.push(value);
        }
        edits.push({ path: note.path, article: note.article, collections: renamed });
    }
    return edits;
}

/** Take shelf `name` off every note: its books stay, on their next shelf. */
export function planDelete(notes: readonly ShelfNote[], name: string): ShelfEdit[] {
    const gone = fold(name);
    return notes
        .filter((note) => note.collections.some((own) => fold(own) === gone))
        .map((note) => {
            const rest = note.collections.filter((own) => fold(own) !== gone);
            return { path: note.path, article: note.article, collections: rest.length > 0 ? rest : null };
        });
}

export type ShelfNameCheck = { ok: true; name: string } | { ok: false; reason: "empty" | "taken" | "reserved"; name: string };

/** A name for a shelf of yours: not empty, not one you have, not one of the Library's own — in any language. */
export function validateShelfName(raw: string, existing: readonly string[], reserved: readonly string[], keep?: string): ShelfNameCheck {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name) return { ok: false, reason: "empty", name };
    if (reserved.some((own) => fold(own) === fold(name))) return { ok: false, reason: "reserved", name };
    if (existing.some((own) => fold(own) === fold(name) && (!keep || fold(own) !== fold(keep)))) return { ok: false, reason: "taken", name };
    return { ok: true, name };
}

/** The shelves you made, as plugin data keeps them: a new one, once. */
export function rememberCreate(list: readonly string[], name: string): string[] {
    return list.some((own) => fold(own) === fold(name)) ? [...list] : [...list, name];
}

export function rememberRename(list: readonly string[], from: string, to: string): string[] {
    const out: string[] = [];
    for (const own of list) {
        const value = fold(own) === fold(from) ? to : own;
        if (!out.some((kept) => fold(kept) === fold(value))) out.push(value);
    }
    if (!out.some((kept) => fold(kept) === fold(to))) out.push(to);
    return out;
}

export function rememberDelete(list: readonly string[], name: string): string[] {
    return list.filter((own) => fold(own) !== fold(name));
}

/** The names plugin data keeps, read: strings, trimmed, once each. */
export function normalizeShelfNames(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const out: string[] = [];
    for (const raw of value) {
        if (typeof raw !== "string" || !raw.trim()) continue;
        const name = raw.trim();
        if (!out.some((kept) => fold(kept) === fold(name))) out.push(name);
    }
    return out;
}
