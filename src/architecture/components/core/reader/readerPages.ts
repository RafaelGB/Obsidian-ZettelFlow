import type { ReaderLayout, ReaderMargins, ReaderWidth } from "./readerPrefs";

/**
 * **Pages or scroll, one page or a spread** (#753, epic #739) — the decisions, pure. A chapter in
 * *Page* or *Spread* is laid out by the platform as CSS columns the size of the screen; this module
 * says how wide they are, whether two fit, how many there are, which one holds a place and what a key
 * means. `ReaderPager` measures once and applies them.
 *
 * No page is numbered (FR-7): a page's number would change with your font size. The place is the
 * chapter, and how far through it you are.
 */

export type BookDirection = "ltr" | "rtl";

/** A `ch` at the reading size, as a share of the font size: close enough for both faces. */
export const CH_PER_EM = 0.5;
/** A page's measure: the same 68 characters a line as the scroll (`.reader-body`). */
export const MAX_MEASURE_CH = 68;
/** Two pages side by side only when each holds a comfortable line (FR-3). */
export const SPREAD_MIN_CH = 45;
/** The least air between two pages, and beside them. */
export const MIN_GAP_PX = 32;
/** A spread is an open book: a shorter line than a single page, and a real gutter (walked, #753). */
export const SPREAD_MAX_CH = 60;
export const SPREAD_GAP_PX = 64;

/**
 * What the type asks of a page (#757): its line in characters — alone, and in a spread — and how much
 * air the margins put between and beside the pages. *Medium* and *Medium* are 3.6's pages.
 */
export interface PageShape {
    measureCh: number;
    spreadCh: number;
    gapScale: number;
}

export const DEFAULT_PAGE_SHAPE: PageShape = { measureCh: MAX_MEASURE_CH, spreadCh: SPREAD_MAX_CH, gapScale: 1 };

/** The width's measure (the stylesheet's `--reader-measure`) and the margins' air, for the pages. */
export function pageShape(width: ReaderWidth, margins: ReaderMargins): PageShape {
    const [measureCh, spreadCh] = width === "narrow" ? [56, 50] : width === "wide" ? [80, 70] : [MAX_MEASURE_CH, SPREAD_MAX_CH];
    const gapScale = margins === "small" ? 0.5 : margins === "large" ? 1.5 : 1;
    return { measureCh, spreadCh, gapScale };
}

export interface PageGeometry {
    /** Pages on screen: two in a spread that fits, one otherwise. */
    perView: 1 | 2;
    /** One page's width. */
    columnPx: number;
    /** The air between two pages — and beside them, so the next page waits just off screen. */
    gapPx: number;
    /** From one page to the next: a page and its gap. */
    stridePx: number;
    /** The width of what is on screen: the pages and the gap between them. */
    viewPx: number;
    /** Two pages are shown. */
    spread: boolean;
}

/** Whether two pages of at least 45 characters, with their gaps, fit in `width` (FR-3, AC-4). */
export function spreadFits(width: number, chPx: number, gapPx: number = MIN_GAP_PX): boolean {
    if (!(width > 0) || !(chPx > 0)) return false;
    return width >= 2 * SPREAD_MIN_CH * chPx + 3 * gapPx;
}

/**
 * The pages for a reading `width` wide. The gap beside the pages equals the gap between them, so the
 * page before and the page after lie exactly off either edge: nothing of them shows.
 */
export function pageGeometry(input: { width: number; chPx: number; layout: ReaderLayout; minGapPx?: number; shape?: PageShape }): PageGeometry {
    const width = Math.max(1, input.width);
    const shape = input.shape ?? DEFAULT_PAGE_SHAPE;
    const spread = input.layout === "spread" && spreadFits(width, input.chPx, input.minGapPx ?? SPREAD_GAP_PX * shape.gapScale);
    const minGap = input.minGapPx ?? (spread ? SPREAD_GAP_PX : MIN_GAP_PX) * shape.gapScale;
    const perView: 1 | 2 = spread ? 2 : 1;
    const widest = (width - (perView + 1) * minGap) / perView;
    const measure = input.chPx > 0 ? (spread ? shape.spreadCh : shape.measureCh) * input.chPx : widest;
    const columnPx = Math.max(1, Math.floor(Math.min(measure, widest)));
    const gapPx = Math.max(0, (width - perView * columnPx) / (perView + 1));
    const stridePx = columnPx + gapPx;
    return { perView, columnPx, gapPx, stridePx, viewPx: perView * columnPx + (perView - 1) * gapPx, spread };
}

/** How many pages a chapter laid out `scrollWidthPx` wide holds — at least one. */
export function pageCount(scrollWidthPx: number, stridePx: number, gapPx: number): number {
    if (!(stridePx > 0) || !Number.isFinite(scrollWidthPx)) return 1;
    return Math.max(1, Math.round((Math.max(0, scrollWidthPx) + gapPx) / stridePx));
}

/** How many screens: a spread shows two pages at a time. */
export function viewCount(pages: number, perView: 1 | 2): number {
    return Math.max(1, Math.ceil(Math.max(1, pages) / perView));
}

const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));

/** The screen that holds a place `offsetPx` into the chapter's strip, in reading order (AC-5). */
export function pageHolding(offsetPx: number, stridePx: number, perView: 1 | 2, views: number): number {
    if (!(stridePx > 0)) return 0;
    const page = Math.floor(Math.max(0, offsetPx) / stridePx);
    return clamp(Math.floor(page / perView), 0, Math.max(0, views - 1));
}

/** The screen a share of the chapter (0–1, as a resume keeps it) lands on (AC-5). */
export function pageForShare(share: number, pages: number, perView: 1 | 2): number {
    const views = viewCount(pages, perView);
    if (!Number.isFinite(share)) return 0;
    return clamp(Math.round(clamp(share, 0, 1) * (views - 1)), 0, views - 1);
}

/** How far through the chapter a screen is (0–1): the hairline, the time left, the kept place (FR-7). */
export function shareOfPage(view: number, pages: number, perView: 1 | 2): number {
    const views = viewCount(pages, perView);
    if (views <= 1) return 1;
    return clamp(view, 0, views - 1) / (views - 1);
}

/** Which way the strip moves for a forward turn: a book written right to left turns left (FR-10). */
export function forwardSign(direction: BookDirection): 1 | -1 {
    return direction === "rtl" ? -1 : 1;
}

/** Where the strip is for a screen: moved against the reading direction, one screen at a time. */
export function stripOffset(view: number, geometry: Pick<PageGeometry, "perView" | "stridePx">, direction: BookDirection): number {
    return -forwardSign(direction) * view * geometry.perView * geometry.stridePx;
}

/** The way a drag goes: 1 forward, -1 back, 0 nowhere — a swipe left is forward in a left-to-right book. */
export function dragDirection(dx: number, direction: BookDirection): 1 | -1 | 0 {
    if (dx === 0) return 0;
    return (dx < 0 ? 1 : -1) * forwardSign(direction) as 1 | -1;
}

/**
 * What a key means (FR-2, FR-4, FR-10). In *Scroll* nothing changes: ← → are the chapters, Space a
 * screen. In *Page* and *Spread*, Space and PageDown turn a page on, and the arrows turn the way the
 * book reads; at a chapter's end the turn becomes the next chapter (the view decides that).
 */
export type KeyIntent = "page+" | "page-" | "chapter+" | "chapter-" | "screen+" | "screen-";

export function keyIntent(layout: ReaderLayout, key: string, shift: boolean, direction: BookDirection = "ltr"): KeyIntent | null {
    if (layout === "scroll") {
        if (key === "ArrowRight" || key === "PageDown") return "chapter+";
        if (key === "ArrowLeft" || key === "PageUp") return "chapter-";
        if (key === " ") return shift ? "screen-" : "screen+";
        return null;
    }
    if (key === " ") return shift ? "page-" : "page+";
    if (key === "PageDown") return "page+";
    if (key === "PageUp") return "page-";
    const rtl = direction === "rtl";
    if (key === "ArrowRight") return rtl ? "page-" : "page+";
    if (key === "ArrowLeft") return rtl ? "page+" : "page-";
    return null;
}

/**
 * A tap on an edge (#750): in *Scroll* the right edge is a screen on, as it was. In pages the edge
 * the book turns towards is forward — the left one in a right-to-left book.
 */
export function edgeTurn(zone: "back" | "forward", layout: ReaderLayout, direction: BookDirection): 1 | -1 {
    const physical = zone === "forward" ? 1 : -1;
    return (layout === "scroll" ? physical : physical * forwardSign(direction)) as 1 | -1;
}

/** The scroll that brings a box whose top is `rectTop` to the top of a stage whose top is `stageTop`. */
export function scrollTopFor(rectTop: number, stageTop: number, scrollTop: number): number {
    return Math.max(0, Math.round(scrollTop + rectTop - stageTop));
}
