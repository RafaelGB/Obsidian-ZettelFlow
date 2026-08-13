import type { LifecycleState } from "./states";

/**
 * The pragmatic transition relation (decision #2): forward promotions along the chain, archive
 * from any live state, an Evergreen→Developing rework back-edge, and an Archived→Fleeting revive.
 * Every other move (skip-ahead, self→self, arbitrary demotions) is rejected. Pure & Obsidian-free.
 */
const TRANSITIONS: Readonly<Record<LifecycleState, readonly LifecycleState[]>> = {
    fleeting: ["literature", "permanent", "archived"],
    literature: ["permanent", "archived"],
    permanent: ["developing", "archived"],
    developing: ["evergreen", "archived"],
    evergreen: ["developing", "archived"],
    archived: ["fleeting"],
};

/** The states reachable from `from` in a single valid transition. */
export function allowedTargets(from: LifecycleState): LifecycleState[] {
    return [...(TRANSITIONS[from] ?? [])];
}

export function canTransition(from: LifecycleState, to: LifecycleState): boolean {
    return (TRANSITIONS[from] ?? []).includes(to);
}
