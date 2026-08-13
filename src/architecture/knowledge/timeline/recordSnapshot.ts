import type { Idea } from "../model/Idea";

/** One point in a note's conceptual history: its lifecycle state + claim texts at a moment (#168). */
export interface Snapshot {
    at: number;
    state: string;
    claims: string[];
}

/** Keep at most this many snapshots per note (drop oldest on overflow). */
export const DEFAULT_MAX_LEN = 20;

/** The note's claim texts, trimmed and blank-filtered, in note order. */
function claimTexts(idea: Idea): string[] {
    return idea.claims.map((claim) => (claim.text ?? "").trim()).filter((text) => text.length > 0);
}

/** Order-insensitive equality of two claim-text sets. */
function sameClaimSet(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((value, index) => value === sortedB[index]);
}

/**
 * Pure, diff-gated snapshot recorder (#168, FR-2/FR-3). Appends a {@link Snapshot} of `idea`'s
 * `state` + claim texts to `history` ONLY when it is a *meaningful* change — the state differs, or
 * the claim-text set differs (order-insensitive) — from the last snapshot; that's AC-1 (no snapshot
 * on a keystroke/no-op edit). The first observation of a note always records a baseline. Bounded to
 * `maxLen` (default 20), dropping the oldest.
 *
 * Immutable: returns the SAME array reference on a no-op, a NEW array on a change; never mutates
 * `history`. Deterministic, never throws. Obsidian-free (reads only the {@link Idea}).
 */
export function recordSnapshot(
    history: Snapshot[],
    idea: Idea,
    now: number,
    opts: { maxLen?: number } = {}
): Snapshot[] {
    const maxLen = opts.maxLen ?? DEFAULT_MAX_LEN;
    const claims = claimTexts(idea);

    const last = history[history.length - 1];
    if (last && last.state === idea.state && sameClaimSet(last.claims, claims)) {
        return history;
    }

    const next = [...history, { at: now, state: idea.state, claims }];
    return next.length > maxLen ? next.slice(next.length - maxLen) : next;
}
