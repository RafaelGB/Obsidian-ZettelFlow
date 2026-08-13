import type { Snapshot } from "./recordSnapshot";

/** Track the conceptual history of at most this many notes (evict least-recently-evolved). */
export const DEFAULT_MAX_NOTES = 200;

/** The `at` of a note's most-recent snapshot (0 if it has none). */
function mostRecent(history: Snapshot[]): number {
    return history.length > 0 ? history[history.length - 1].at : 0;
}

/**
 * Pure total-notes cap (#168, FR-3). When more than `maxNotes` notes carry a timeline, keeps the
 * `maxNotes` whose **most-recent** snapshot is newest (the actively-evolving ones) and drops the
 * rest; ties on the most-recent time are broken by keeping the lexicographically smaller path.
 *
 * Immutable: returns the SAME record when already within the cap, a NEW record otherwise; never
 * mutates the input. Deterministic, never throws.
 */
export function evictOldestNotes(
    snapshots: Record<string, Snapshot[]>,
    maxNotes: number = DEFAULT_MAX_NOTES
): Record<string, Snapshot[]> {
    const paths = Object.keys(snapshots);
    if (paths.length <= maxNotes) return snapshots;

    const keep = new Set(
        [...paths]
            .sort((a, b) => mostRecent(snapshots[b]) - mostRecent(snapshots[a]) || (a < b ? -1 : a > b ? 1 : 0))
            .slice(0, maxNotes)
    );

    const result: Record<string, Snapshot[]> = {};
    for (const path of paths) {
        if (keep.has(path)) result[path] = snapshots[path];
    }
    return result;
}
