/**
 * The minimal delta between two snapshots, so the field inspector (and later, panels) can update
 * **in place** rather than rebuilding the DOM on every Base update (AC-4). The decision of what
 * changed is pure and testable here; applying it to the DOM is the inspector's job (node jest has
 * no Obsidian `createEl`, so the logic lives where it can be proven).
 */
import { DataStoreSnapshot } from "./types";

export interface ReconcilePlan {
    /** Field ids present in `next` but not `prev`. */
    added: string[];
    /** Field ids present in `prev` but not `next`. */
    removed: string[];
    /** Field ids present in both. */
    unchanged: string[];
    /** Whether the row count changed (a filter narrowing keeps fields but changes the count). */
    rowCountChanged: boolean;
}

export function reconcilePlan(
    prev: DataStoreSnapshot | null,
    next: DataStoreSnapshot,
): ReconcilePlan {
    const prevIds = new Set((prev?.schema.fields ?? []).map((field) => field.id));
    const nextIds = next.schema.fields.map((field) => field.id);
    const nextIdSet = new Set(nextIds);

    const added = nextIds.filter((id) => !prevIds.has(id));
    const removed = [...prevIds].filter((id) => !nextIdSet.has(id));
    const unchanged = nextIds.filter((id) => prevIds.has(id));
    const rowCountChanged = (prev?.rowCount ?? -1) !== next.rowCount;

    return { added, removed, unchanged, rowCountChanged };
}
