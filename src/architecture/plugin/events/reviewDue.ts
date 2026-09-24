import { matchBindings, type WorkflowBinding } from "./bindings";
import type { WorkflowEventPayload } from "./vocabulary";

/**
 * `review.due` stops being reserved (#563, epic #558) — pure.
 *
 * The token has been in the vocabulary since #150 and has never meant anything. It means this: *a
 * claim you stated is ready to be looked at again*. It is the first event in this product that is
 * not a reaction to something you just did to a file.
 *
 * Wiring it needed **no scheduler**. The engine already arms on layout-ready and already runs a
 * debounced pass whenever metadata changes; the sweep rides both, adds no `EventRef` and no timer,
 * and returns immediately when nothing is bound to it. That last part is the whole reason this is a
 * separate, pure module: the guard is a decision, and a decision belongs where it can be tested.
 */

/** Once per note per day. A claim that came back this morning does not come back this afternoon. */
export const REVIEW_DUE_DAY_MS = 86_400_000;

export function reviewDuePayload(notePath: string): WorkflowEventPayload {
    return { event: "review.due", notePath };
}

/** Per-note, and deliberately not per-binding: the day belongs to the claim, not to the flow. */
export function reviewDueThrottleKey(notePath: string): string {
    return `review.due::${notePath}`;
}

/**
 * Whether anything is listening. The sweep costs a projection over the model, so it must not run
 * for the overwhelming majority of vaults, which have no flow bound to this event at all.
 */
export function wantsReviewDue(bindings: WorkflowBinding[]): boolean {
    return matchBindings("review.due", bindings).length > 0;
}
