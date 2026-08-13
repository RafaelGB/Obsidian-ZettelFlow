export const MAX_HISTORY = 50;

/** Single entry in the ZettelFlow notes history. */
export interface HistoryEntry {
    /** Vault-relative path of the created note */
    notePath: string;
    /** Vault-relative path of the canvas that originated the note */
    canvasPath: string;
    /** Unix timestamp (ms) of creation */
    createdAt: number;
}

/** Prepend an entry to the history list, capping at MAX_HISTORY. Pure function. */
export function appendHistory(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
    const updated = [entry, ...history];
    return updated.length > MAX_HISTORY ? updated.slice(0, MAX_HISTORY) : updated;
}

/** Returns an empty history list. */
export function clearHistory(): HistoryEntry[] {
    return [];
}
