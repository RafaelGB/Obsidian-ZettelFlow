import { Completion } from "./typing";

/**
 * Shared, dependency-free engine for walking a completion tree, used by the `.js` CodeView editor
 * and the Script-action editor (identical logic before this was extracted). A node is either an
 * array of {@link Completion}s (a leaf list) or a record whose keys are the next path segments.
 */

/** Defaults applied to the synthetic completions generated from a node's keys. */
export interface KeyCompletionDefaults {
    info: string;
    detail: string;
    boost?: number;
    type?: string;
}

export function isCompletionArray(node: unknown): node is Completion[] {
    return Array.isArray(node);
}

function keysToCompletions(
    node: Record<string, unknown>,
    defaults: KeyCompletionDefaults
): Completion[] {
    return Object.keys(node).map((key) => ({
        label: key,
        type: defaults.type ?? "object",
        info: defaults.info,
        boost: defaults.boost ?? 99,
        detail: defaults.detail,
    }));
}

/**
 * Resolves the completions for a dotted path against the tree.
 *
 * - An array node is a leaf list → returned as-is.
 * - With no remaining segments, the node's keys become object completions.
 * - An unknown next segment falls back to the current node's keys (so a half-typed path still
 *   suggests siblings).
 * - Reaching a non-object, non-array leaf yields `null` (nothing to suggest).
 */
export function findCompletions(
    segments: string[],
    node: Record<string, unknown> | Completion[],
    defaults: KeyCompletionDefaults
): Completion[] | null {
    if (isCompletionArray(node)) return node;

    if (segments.length === 0) {
        return keysToCompletions(node, defaults);
    }

    const nextSegment = segments[0];
    const nextNode = node[nextSegment] as Record<string, unknown> | undefined;
    if (!nextNode) {
        return keysToCompletions(node, defaults);
    }

    if (typeof nextNode !== "object" || nextNode === null) {
        return null;
    }

    return findCompletions(segments.slice(1), nextNode, defaults);
}
