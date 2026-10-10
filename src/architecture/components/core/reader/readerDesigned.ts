import type { KeyIntent } from "./readerPages";

/**
 * **A designed book in the Reader** (#771): what turning means on its pages. They are read through
 * the run of pages (#767) — the zoom, *Page*, *Spread* and *Scroll* are that run's — and here is only
 * what a fixed-layout book adds to it: which way a right-to-left book turns.
 *
 * In a right-to-left book (most manga) the next page is to the **left** (a spec gap of #771, settled
 * as Apple Books and Kindle do): ← is next, → is back, the left edge turns on, a swipe to the right
 * turns on, and the leaf turns over from the right — the same motion as going back in a book that
 * reads left to right.
 */
export type TurnDirection = "ltr" | "rtl";

/**
 * A key on a designed page, in *Page* or *Spread*: the arrows and PageDown/PageUp turn a view the way
 * the book reads; Space is a screen (a page zoomed past the screen is read down first).
 */
export function designedKeyIntent(key: string, shift: boolean, direction: TurnDirection): KeyIntent | null {
    const rtl = direction === "rtl";
    if (key === "ArrowRight") return rtl ? "chapter-" : "chapter+";
    if (key === "ArrowLeft") return rtl ? "chapter+" : "chapter-";
    if (key === "PageDown") return "chapter+";
    if (key === "PageUp") return "chapter-";
    if (key === " ") return shift ? "screen-" : "screen+";
    return null;
}

/** The way a turn looks: forward in a right-to-left book is the leaf a left-to-right one turns back. */
export function visibleTurn(turn: 1 | -1, direction: TurnDirection): 1 | -1 {
    return direction === "rtl" ? (-turn as 1 | -1) : turn;
}
