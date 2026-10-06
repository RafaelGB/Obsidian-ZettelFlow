import { READING_KINDS, type ReaderKind } from "./readerContract";

/**
 * **Saved readings** (#672) — pure, over a small list kept in plugin data.
 *
 * A path you liked, kept in the order you read it: the note it started from, how it was chosen
 * and its chapters. Saving writes no note — it is a place in the plugin's data, like resume — and
 * a saved reading opens again as the same chapters, in the same order, whatever the vault has
 * grown since.
 */
export interface SavedReading {
    id: string;
    name: string;
    /** How the chapters were first chosen — kept for the label, never to rebuild them. */
    kind: ReaderKind;
    seed: string;
    paths: string[];
    at: number;
}

/** How many readings are kept; the oldest is forgotten first. */
export const SAVED_LIMIT = 30;

/** A short id from the moment and the chapters, stable enough to rename and delete by. */
export function savedId(paths: readonly string[], now: number): string {
    let hash = 5381;
    for (const ch of `${now}\n${paths.join("\n")}`) hash = ((hash << 5) + hash + ch.charCodeAt(0)) | 0;
    return `r${(hash >>> 0).toString(36)}`;
}

/** Keep a reading, newest first. The same chapters saved again replace the older entry. */
export function saveReading(list: readonly SavedReading[], entry: SavedReading): SavedReading[] {
    const same = (other: SavedReading) => other.paths.join("\n") === entry.paths.join("\n");
    return [entry, ...list.filter((other) => other.id !== entry.id && !same(other))].slice(0, SAVED_LIMIT);
}

export function renameReading(list: readonly SavedReading[], id: string, name: string): SavedReading[] {
    const clean = name.trim();
    if (!clean) return [...list];
    return list.map((entry) => (entry.id === id ? { ...entry, name: clean } : entry));
}

export function deleteReading(list: readonly SavedReading[], id: string): SavedReading[] {
    return list.filter((entry) => entry.id !== id);
}

/** The saved readings that pass through a note — what its chooser offers. */
export function savedThrough(list: readonly SavedReading[], notePath: string): SavedReading[] {
    return list.filter((entry) => entry.seed === notePath || entry.paths.includes(notePath));
}

/** Read a stored list, keeping only well-formed entries. Never throws. */
export function normalizeSaved(raw: unknown): SavedReading[] {
    if (!Array.isArray(raw)) return [];
    const out: SavedReading[] = [];
    for (const value of raw) {
        const v = value as Record<string, unknown> | null;
        if (!v || typeof v.id !== "string" || typeof v.name !== "string" || typeof v.seed !== "string") continue;
        if (typeof v.kind !== "string" || !(READING_KINDS as readonly string[]).includes(v.kind)) continue;
        if (typeof v.at !== "number" || !Array.isArray(v.paths)) continue;
        const paths = v.paths.filter((p): p is string => typeof p === "string" && p.length > 0);
        if (paths.length === 0) continue;
        out.push({ id: v.id, name: v.name, kind: v.kind as ReaderKind, seed: v.seed, paths, at: v.at });
    }
    return out;
}
