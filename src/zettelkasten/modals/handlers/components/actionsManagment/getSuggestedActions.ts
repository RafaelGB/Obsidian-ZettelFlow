import type { ActionCardInfo } from "./typing";

/** Static affinity pairs: when the left action is in the step, suggest the right one. */
const AFFINITY: readonly [string, string][] = [
    ["prompt", "create-semantic-relation"],
    ["detect-orphan", "calculate-maturity"],
    ["summarize", "suggest-connections"],
    ["find-related", "suggest-link"],
    ["extract-claims", "compare-claims"],
    ["generate-questions", "thinking-simulator"],
];

/**
 * Pure function — no side-effects, no I/O, no async.
 * Given the action IDs already on the step and the full registry, return up to 3 complementary
 * action cards based on a static affinity map. Cards already present in `existingActionIds` are
 * excluded from results.
 */
export function getSuggestedActions(
    existingActionIds: string[],
    registry: ActionCardInfo[]
): ActionCardInfo[] {
    if (existingActionIds.length === 0) return [];

    const existing = new Set(existingActionIds);
    const suggested = new Set<string>();

    for (const [from, to] of AFFINITY) {
        if (existing.has(from) && !existing.has(to)) {
            suggested.add(to);
        }
    }

    const result: ActionCardInfo[] = [];
    for (const id of suggested) {
        if (result.length >= 3) break;
        const card = registry.find((c) => c.id === id);
        if (card) result.push(card);
    }
    return result;
}
