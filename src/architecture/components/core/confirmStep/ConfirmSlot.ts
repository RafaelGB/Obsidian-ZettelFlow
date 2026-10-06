import { createContext } from "react";

/**
 * **Where the control that ends a step is drawn** (#684, epic #676).
 *
 * The wizard has one persistent footer — Back · Skip this step · Build with what I have · Confirm —
 * so the primary action stops moving with every step. The step still *owns* its confirm: its
 * handler, its refusal, its accelerator and its hint stay in `ConfirmStep`, next to the answer they
 * judge. Only the drawing moves, through a portal into the element this context carries.
 *
 * `null` (the default) means there is no footer — a test, or any host other than the wizard — and
 * the control renders in place, exactly as it always did.
 */
export const ConfirmSlotContext = createContext<HTMLElement | null>(null);
