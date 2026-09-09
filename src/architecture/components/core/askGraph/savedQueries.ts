import type { SavedGraphQuery } from "config";

/**
 * Pure saved-query operations for the Ask-your-graph mode (#323, enriched G4). Kept Obsidian-free so
 * the add / rename / reorder / pin rules are unit-tested without a view; the renderer persists the
 * result in settings. Every operation is keyed by the query text (the identity) and returns a fresh
 * canonical list, so it also migrates the legacy `string[]` shape transparently.
 */

/** What the persisted list may hold on disk: the legacy bare string, or the richer object. */
export type SavedGraphQueryInput = string | SavedGraphQuery;

/** The label to show for a saved query — its name if given, else the query text itself. */
export function savedQueryLabel(entry: SavedGraphQuery): string {
    const name = entry.name?.trim();
    return name ? name : entry.query;
}

/**
 * Canonicalise the persisted list: upgrade legacy strings to objects, trim, drop blanks, de-dupe by
 * query text, and normalise metadata (blank name → omitted, falsy pin → omitted).
 */
export function normalizeSavedQueries(list: readonly SavedGraphQueryInput[] | undefined): SavedGraphQuery[] {
    if (!list) return [];
    const out: SavedGraphQuery[] = [];
    const seen = new Set<string>();
    for (const raw of list) {
        const entry = typeof raw === "string" ? { query: raw } : raw;
        const query = entry.query?.trim() ?? "";
        if (query === "" || seen.has(query)) continue;
        seen.add(query);
        const name = entry.name?.trim();
        const normalized: SavedGraphQuery = { query };
        if (name) normalized.name = name;
        if (entry.pinned) normalized.pinned = true;
        out.push(normalized);
    }
    return out;
}

/** Append a query (trimmed, de-duplicated by query text); a blank query is a no-op. */
export function addSavedQuery(list: readonly SavedGraphQueryInput[], query: string): SavedGraphQuery[] {
    const normalized = normalizeSavedQueries(list);
    const q = query.trim();
    if (q === "" || normalized.some((entry) => entry.query === q)) return normalized;
    return [...normalized, { query: q }];
}

/** Drop a query from the saved list (by query text). */
export function removeSavedQuery(list: readonly SavedGraphQueryInput[], query: string): SavedGraphQuery[] {
    return normalizeSavedQueries(list).filter((entry) => entry.query !== query);
}

/** Rename a saved query; a blank name clears it (the label falls back to the query text). */
export function renameSavedQuery(
    list: readonly SavedGraphQueryInput[],
    query: string,
    name: string
): SavedGraphQuery[] {
    const trimmed = name.trim();
    return normalizeSavedQueries(list).map((entry) => {
        if (entry.query !== query) return entry;
        const next: SavedGraphQuery = { query: entry.query };
        if (trimmed) next.name = trimmed;
        if (entry.pinned) next.pinned = true;
        return next;
    });
}

/** Move a saved query one slot toward the start ("up") or end ("down"); out-of-range is a no-op. */
export function moveSavedQuery(
    list: readonly SavedGraphQueryInput[],
    query: string,
    direction: "up" | "down"
): SavedGraphQuery[] {
    const normalized = normalizeSavedQueries(list);
    const from = normalized.findIndex((entry) => entry.query === query);
    if (from === -1) return normalized;
    const to = direction === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= normalized.length) return normalized;
    const next = [...normalized];
    [next[from], next[to]] = [next[to], next[from]];
    return next;
}

/** Flip whether a saved query is pinned to Home. */
export function togglePinnedQuery(list: readonly SavedGraphQueryInput[], query: string): SavedGraphQuery[] {
    return normalizeSavedQueries(list).map((entry) => {
        if (entry.query !== query) return entry;
        const next: SavedGraphQuery = { query: entry.query };
        if (entry.name) next.name = entry.name;
        if (!entry.pinned) next.pinned = true;
        return next;
    });
}

/** The pinned subset, in saved order — what Home surfaces as "N notes match …". */
export function pinnedQueries(list: readonly SavedGraphQueryInput[] | undefined): SavedGraphQuery[] {
    return normalizeSavedQueries(list).filter((entry) => entry.pinned);
}
