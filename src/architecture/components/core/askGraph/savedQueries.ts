/**
 * Pure saved-query list operations for the Ask-your-graph mode (#323). Kept Obsidian-free so the
 * add/dedupe/remove rules are unit-tested without a view; the renderer persists the result in settings.
 */

/** Append a query, trimmed and de-duplicated; a blank query is a no-op. */
export function addSavedQuery(list: readonly string[], query: string): string[] {
    const q = query.trim();
    if (q === "" || list.includes(q)) return [...list];
    return [...list, q];
}

/** Drop a query from the saved list. */
export function removeSavedQuery(list: readonly string[], query: string): string[] {
    return list.filter((q) => q !== query);
}
