import type { NextMoveToken } from "architecture/knowledge/state";

/**
 * What the next-step card has on screen (#641) — which move, and whether its panel is open. Pure,
 * so the rules (wrap around, start again after a write, land on a deep-linked move) are proved by
 * tests rather than re-decided in click handlers.
 */
export interface NextStepUi {
    index: number;
    open: boolean;
}

export const INITIAL_NEXT_UI: NextStepUi = { index: 0, open: false };

/** *Another step*: the next move, wrapping, with its panel closed (FR-6). */
export function anotherMove(ui: NextStepUi, count: number): NextStepUi {
    return { index: count > 0 ? (ui.index + 1) % count : 0, open: false };
}

export function openPanel(ui: NextStepUi): NextStepUi {
    return { ...ui, open: true };
}

export function closePanel(ui: NextStepUi): NextStepUi {
    return { ...ui, open: false };
}

/** After a write lands in the model: back to the first move that is still open (FR-9). */
export function rederive(): NextStepUi {
    return INITIAL_NEXT_UI;
}

/** Keep the index inside the moves there are now. */
export function clampMove(ui: NextStepUi, count: number): NextStepUi {
    return ui.index < count ? ui : INITIAL_NEXT_UI;
}

/**
 * A hand-over asked for `move` (FR-21): that move, with its panel open. A move the note no longer
 * has lands on the first one, closed — the hand-over still arrives somewhere true.
 */
export function deepLink(tokens: readonly NextMoveToken[], move?: NextMoveToken): NextStepUi {
    const index = move ? tokens.indexOf(move) : -1;
    return index >= 0 ? { index, open: true } : INITIAL_NEXT_UI;
}
