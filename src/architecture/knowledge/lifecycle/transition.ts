import { STATE_LABEL_KEY, type LifecycleState } from "./states";

/**
 * A lifecycle change, as a fact about **two** states (#580) — pure.
 *
 * Cultivate showed a promotion as a new emoji, which is the one thing it cannot be: an emoji says
 * where you are, never where you came from. *You advanced this note* is a sentence about a
 * transition, so the transition has to be an object before it can be said.
 *
 * It is deliberately not the same thing as `canTransition`: that answers *may this happen*, this
 * one describes *what happened*. A change the machine would refuse still gets described here, since
 * the property can also be edited by hand in the note.
 */
export interface StateTransition {
    from: LifecycleState;
    to: LifecycleState;
    /** i18n keys, so the Experience layer needs no lifecycle vocabulary of its own. */
    fromKey: string;
    toKey: string;
}

function known(value: unknown): value is LifecycleState {
    return typeof value === "string" && value in STATE_LABEL_KEY;
}

/**
 * The transition between two states, or `null` when there is nothing to say — an unknown token on
 * either side, or a state that did not change.
 */
export function stateTransition(from: unknown, to: unknown): StateTransition | null {
    if (!known(from) || !known(to) || from === to) return null;
    return { from, to, fromKey: STATE_LABEL_KEY[from], toKey: STATE_LABEL_KEY[to] };
}
