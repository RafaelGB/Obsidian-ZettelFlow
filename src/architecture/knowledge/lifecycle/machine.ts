import { FALLBACK_STATE, isLifecycleState, type LifecycleState } from "./states";

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

/**
 * The state a note is offered next (#641, extracted from Cultivate #309): the first valid forward
 * transition, never archiving while another is open. Cultivate's advance move and This note's
 * next-step card both read this, so the two can never propose different states. An unknown or
 * missing state reads as fleeting (decision #1).
 */
export function proposedNextState(state: string): LifecycleState | null {
    const from = isLifecycleState(state) ? state : FALLBACK_STATE;
    const targets = allowedTargets(from);
    return targets.find((target) => target !== "archived") ?? targets[0] ?? null;
}
