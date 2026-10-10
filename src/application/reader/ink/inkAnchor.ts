/**
 * **Where ink is** (#745 E2, epic #740) — pure.
 *
 * Ink written beside a passage must stay beside it at any font size, column width and re-flow (FR-11).
 * So it is never kept in pixels. It is kept **relative to the words nearest its first stroke**, which
 * are found again by the same text-quote anchor highlights use:
 *
 * - `side` — over the text, or in the left or right margin;
 * - `x` — a fraction of that region's width;
 * - `line` — the vertical offset from the anchor word's line, in line heights;
 * - `em` — the reading text's size in px when it was written; the strokes are in ems, so a new
 *   size is a single scale.
 *
 * A fixed page (a PDF in Page view) keeps fractions of the page's own box instead: exact under zoom,
 * fit and crop (AC-2).
 */

import { quoteAt, type TextQuote } from "application/thinking/quoteAnchor";

export type InkSide = "text" | "left" | "right";

export interface InkAnchor {
    /** The words nearest the first stroke, with their context; `null` where the chapter has none. */
    quote: TextQuote | null;
    side: InkSide;
    x: number;
    line: number;
    em: number;
}

/** A page anchor: the ink's box as fractions of the page. */
export interface PageInkAnchor {
    px: number;
    py: number;
    pw: number;
    ph: number;
}

export interface Box {
    left: number;
    top: number;
    width: number;
    height: number;
}

/** A word on screen, with where it is in the chapter's text. */
export interface WordBox extends Box {
    start: number;
    end: number;
}

/**
 * The reading column and the room beside it, in the same coordinates as the boxes: the text from
 * `left` for `width`, the margins out to `outerLeft` and `outerRight`.
 */
export interface Column {
    left: number;
    width: number;
    outerLeft: number;
    outerRight: number;
}

/** Ems a fixed page is wide, for the size of its ink: about the reading size on a phone-width page. */
export const PAGE_EMS = 40;

/** How far a point is from a box, the vertical counted four times: *beside* means the same line. */
function nearness(box: Box, x: number, y: number): number {
    const dx = x < box.left ? box.left - x : x > box.left + box.width ? x - box.left - box.width : 0;
    const dy = y < box.top ? box.top - y : y > box.top + box.height ? y - box.top - box.height : 0;
    return dy * 4 + dx;
}

/** The word nearest a point, or `null` when there are none. */
export function nearestWord<T extends Box>(words: readonly T[], x: number, y: number): T | null {
    let best: T | null = null;
    let bestScore = Infinity;
    for (const word of words) {
        const score = nearness(word, x, y);
        if (score < bestScore) {
            best = word;
            bestScore = score;
        }
    }
    return best;
}

function region(side: InkSide, column: Column): { left: number; width: number } {
    if (side === "left") return { left: column.outerLeft, width: Math.max(1, column.left - column.outerLeft) };
    if (side === "right") return { left: column.left + column.width, width: Math.max(1, column.outerRight - column.left - column.width) };
    return { left: column.left, width: Math.max(1, column.width) };
}

/** Which region a box is in: by its middle. */
export function sideOf(box: Box, column: Column): InkSide {
    const middle = box.left + box.width / 2;
    if (middle < column.left) return "left";
    if (middle > column.left + column.width) return "right";
    return "text";
}

/**
 * Anchor an ink note: the words nearest its first stroke (`first`), and its box (`box`, the note's
 * origin is its top-left) relative to them.
 */
export function anchorInk(input: {
    box: Box;
    first: { x: number; y: number };
    words: readonly WordBox[];
    column: Column;
    fontPx: number;
    linePx: number;
    text: string;
}): { anchor: InkAnchor; word: WordBox | null } {
    const { box, first, column, fontPx, linePx } = input;
    const side = sideOf(box, column);
    const area = region(side, column);
    const x = (box.left - area.left) / area.width;
    const word = nearestWord(input.words, first.x, first.y);
    const quote = word ? quoteAt(input.text, word.start, word.end)?.quote ?? null : null;
    const line = word ? (box.top - word.top) / Math.max(1, linePx) : 0;
    return { anchor: { quote, side, x: round(x), line: round(line), em: fontPx }, word };
}

const round = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Where an anchored note goes now: its origin's place and the scale of its strokes. `unit` is px per
 * em of the drawing — the reading size now; `scale` the same as a ratio of the size it was written at.
 */
export function placeInk(anchor: InkAnchor, word: Box, column: Column, fontPx: number, linePx: number): { left: number; top: number; scale: number; unit: number } {
    const area = region(anchor.side, column);
    return {
        left: area.left + anchor.x * area.width,
        top: word.top + anchor.line * linePx,
        scale: fontPx / Math.max(1, anchor.em),
        unit: fontPx,
    };
}

/** A note on a fixed page: its box as fractions of the page box (AC-2). */
export function pageAnchor(box: Box, page: Box): PageInkAnchor {
    const w = Math.max(1, page.width);
    const h = Math.max(1, page.height);
    return { px: round((box.left - page.left) / w), py: round((box.top - page.top) / h), pw: round(box.width / w), ph: round(box.height / h) };
}

/** Where page ink goes on the page as it is shown now; its strokes are `PAGE_EMS` to the page width. */
export function placePageInk(anchor: PageInkAnchor, page: Box): { left: number; top: number; unit: number } {
    return { left: page.left + anchor.px * page.width, top: page.top + anchor.py * page.height, unit: page.width / PAGE_EMS };
}

/**
 * A note kept on the page: its left edge moved in, never out, so a note written in a wide margin
 * stays on screen when the margin narrows (an iPad turned to portrait). Its side is unchanged.
 */
export function keepOnPage(left: number, width: number, column: Column): number {
    const max = column.outerRight - width;
    return Math.max(column.outerLeft, Math.min(left, max));
}
