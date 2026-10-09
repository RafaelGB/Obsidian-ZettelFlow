/**
 * **Page view, grown up** (#767, epic #739): the arithmetic of a PDF read as it was printed. Pure —
 * no DOM, no pdf.js — so every rule the run of pages lives by is tested on its own.
 *
 * A page's size is in PDF points. The run draws every page at one **scale** (CSS pixels per point),
 * so a landscape page is wider than its neighbours, as it is in the paper. The **zoom level** a reader
 * sees is that scale over the scale that fits the page's width: *Fit width* is 100 %, twice that is
 * 200 %, and the level is kept between 50 % and 400 % (FR-1). *Fit page* is a framing, not a level:
 * it may be smaller than 50 % on a wide screen, and it is allowed to be.
 */

import type { ReaderLayout } from "architecture/components/core/reader/readerPrefs";

export type PageFit = "width" | "page";
export type PageRotation = 0 | 90 | 180 | 270;

export interface PageSize {
    width: number;
    height: number;
}

/** A rectangle in the run, in CSS pixels. */
export interface Slot {
    page: number;
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface Scroll {
    left: number;
    top: number;
}

/** The smallest and the largest zoom level, as a share of *Fit width* (FR-1). */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 4;
/** One press of + or −, a step of the wheel: a fifth more, or a fifth less. */
export const ZOOM_STEP = 1.25;
/**
 * The most pixels one canvas may hold. WebKit refuses (draws nothing) past 16,777,216 — 4096² — on
 * iPadOS; Chromium allows more. The run caps every page at this, so a page at 400 % is drawn at the
 * cap, softer, and never blank (FR-4). The device walk on #750 (P11) is where a real limit is measured.
 */
export const CANVAS_MAX_PIXELS = 16_777_216;
/** However far the paper and however small the zoom, no more pages than this are drawn (FR-14). */
export const MAX_DRAWN = 7;
/** Room around the run and between its pages, in CSS pixels (the 4-grid's 16). */
export const RUN_PAD = 16;
export const RUN_GAP = 16;
/** A spread needs a reading at least this much wider than it is tall (iPad landscape yes, portrait no). */
export const SPREAD_ASPECT = 1.2;

/** A page as it is drawn: its sides swapped when it is turned a quarter (FR-9). */
export function pageBox(size: PageSize, rotation: number): PageSize {
    const quarter = ((((rotation % 360) + 360) % 360) / 90) % 2 === 1;
    return quarter ? { width: size.height, height: size.width } : { width: size.width, height: size.height };
}

/** The level kept between 50 % and 400 %. */
export function clampZoom(level: number): number {
    if (!Number.isFinite(level)) return 1;
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, level));
}

/**
 * Past a limit the pinch resists (FR-17): it keeps following the fingers, each step counting for less,
 * and springs back to the limit when they let go. Inside the limits it is the level itself.
 */
export function rubberZoom(level: number, min = ZOOM_MIN, max = ZOOM_MAX): number {
    if (!(level > 0)) return min;
    if (level > max) return max * Math.pow(level / max, 0.25);
    if (level < min) return min * Math.pow(level / min, 0.25);
    return level;
}

/**
 * The scale (CSS pixels per point) for a framing of `box` in a view: *width* fits the page's width,
 * *page* the whole page, a number is a level of *Fit width*. `columns` is two in a spread.
 */
export function zoomFor(fit: PageFit | number, box: PageSize, view: PageSize, columns = 1): number {
    const across = Math.max(1, view.width - 2 * RUN_PAD - (columns - 1) * RUN_GAP) / columns;
    const down = Math.max(1, view.height - 2 * RUN_PAD);
    const width = across / Math.max(1, box.width);
    if (fit === "width") return width;
    if (fit === "page") return Math.min(width, down / Math.max(1, box.height));
    return width * clampZoom(fit);
}

/**
 * Where to scroll so the point under the pointer stays under it while the scale changes from `from`
 * to `to` (FR-3) — along one axis. `focal` is the pointer's distance from the view's edge; `offset` is
 * where the content starts in the scroll (a run narrower than the view is centred).
 */
export function focalScroll(scroll: number, focal: number, from: number, to: number, offsetFrom = 0, offsetTo = 0): number {
    const at = (scroll + focal - offsetFrom) / Math.max(1e-6, from);
    return Math.max(0, at * to + offsetTo - focal);
}

/**
 * The size a page's canvas is drawn at: its box times the device's pixel ratio, scaled down to fit
 * `maxPixels` with its aspect kept, and never 0 (FR-4, AC-2).
 */
export function drawSize(cssWidth: number, cssHeight: number, ratio: number, maxPixels = CANVAS_MAX_PIXELS): { width: number; height: number } {
    let width = Math.max(1, cssWidth) * Math.max(0.5, ratio || 1);
    let height = Math.max(1, cssHeight) * Math.max(0.5, ratio || 1);
    if (width * height > maxPixels) {
        const k = Math.sqrt(maxPixels / (width * height));
        width *= k;
        height *= k;
    }
    let w = Math.max(1, Math.floor(width));
    let h = Math.max(1, Math.floor(height));
    // Rounding may leave a pixel over the cap: take it off the longer side.
    while (w * h > maxPixels) {
        if (w >= h) w--;
        else h--;
    }
    return { width: w, height: h };
}

/** Whether a spread has room: a reading clearly wider than it is tall (the plan's 1.2×). */
export function pdfSpreadFits(view: PageSize): boolean {
    return view.width > 0 && view.height > 0 && view.width >= SPREAD_ASPECT * view.height;
}

/**
 * The views of a paper in *Page* and *Spread* (FR-6): one page each, or — in a spread — page 1 alone
 * (on the right, as a printed book opens), then pairs. Each view is its pages' indices.
 */
export function viewsOf(count: number, layout: ReaderLayout, fits: boolean): number[][] {
    const views: number[][] = [];
    if (layout !== "spread" || !fits) {
        for (let i = 0; i < count; i++) views.push([i]);
        return views;
    }
    if (count > 0) views.push([0]);
    for (let i = 1; i < count; i += 2) views.push(i + 1 < count ? [i, i + 1] : [i]);
    return views;
}

/** The view holding `page`. */
export function viewIndexOf(views: readonly number[][], page: number): number {
    const at = views.findIndex((view) => view.includes(page));
    return at < 0 ? 0 : at;
}

export interface RunOptions {
    layout: ReaderLayout;
    /** In *Scroll*: side by side, in a horizontal strip (FR-7). */
    across: boolean;
    scale: number;
    view: PageSize;
    /** In *Page* and *Spread*: the page whose view is laid out. */
    current?: number;
    /** In *Spread*: whether two pages fit (else one per view). */
    fits?: boolean;
    /**
     * At *Fit width*, no page is wider than this: a landscape table in a portrait paper is fitted on
     * its own rather than running off the screen. A level of zoom has no cap — overflow is asked for.
     */
    capWidth?: number;
}

export interface RunLayout {
    slots: Slot[];
    width: number;
    height: number;
    /** In *Page* and *Spread*, the pages of the view laid out; every page in *Scroll*. */
    pages: number[];
}

/**
 * Where every page sits (AC-3): in *Scroll*, a column (Down) or a row (Across) of every page, each
 * centred across the run; in *Page* and *Spread*, the one or two pages of the current view, a spread
 * meeting at the gutter — page 1 on the right of it.
 */
export function runLayout(boxes: readonly PageSize[], options: RunOptions): RunLayout {
    const { layout, across, scale, view } = options;
    const size = (i: number) => {
        const k = options.capWidth && boxes[i].width * scale > options.capWidth ? options.capWidth / boxes[i].width : scale;
        // Floored: a page rounded up a pixel would give the run a scrollbar it has no use for.
        return { w: Math.max(1, Math.floor(boxes[i].width * k)), h: Math.max(1, Math.floor(boxes[i].height * k)) };
    };
    if (layout === "scroll") {
        const sizes = boxes.map((_, i) => size(i));
        const slots: Slot[] = [];
        if (across) {
            const tallest = Math.max(0, ...sizes.map((s) => s.h));
            const height = Math.max(view.height, tallest + 2 * RUN_PAD);
            let x = RUN_PAD;
            sizes.forEach((s, page) => {
                slots.push({ page, x, y: Math.round((height - s.h) / 2), w: s.w, h: s.h });
                x += s.w + RUN_GAP;
            });
            const width = Math.max(view.width, x - RUN_GAP + RUN_PAD);
            return { slots, width, height, pages: slots.map((s) => s.page) };
        }
        const widest = Math.max(0, ...sizes.map((s) => s.w));
        const width = Math.max(view.width, widest + 2 * RUN_PAD);
        let y = RUN_PAD;
        sizes.forEach((s, page) => {
            slots.push({ page, x: Math.round((width - s.w) / 2), y, w: s.w, h: s.h });
            y += s.h + RUN_GAP;
        });
        return { slots, width, height: Math.max(view.height, y - RUN_GAP + RUN_PAD), pages: slots.map((s) => s.page) };
    }
    const views = viewsOf(boxes.length, layout, options.fits ?? true);
    const pages = views[viewIndexOf(views, options.current ?? 0)] ?? [];
    const sizes = pages.map(size);
    const spread = layout === "spread" && (options.fits ?? true);
    const tallest = Math.max(0, ...sizes.map((s) => s.h));
    const height = Math.max(view.height, tallest + 2 * RUN_PAD);
    if (!spread) {
        const s = sizes[0] ?? { w: 1, h: 1 };
        const width = Math.max(view.width, s.w + 2 * RUN_PAD);
        return { slots: pages.map((page) => ({ page, x: Math.round((width - s.w) / 2), y: RUN_PAD, w: s.w, h: s.h })), width, height, pages };
    }
    // Two pages meet at the gutter in the middle; page 1, alone, opens on its right.
    const half = Math.max(...sizes.map((s) => s.w), 1);
    const width = Math.max(view.width, 2 * half + RUN_GAP + 2 * RUN_PAD);
    const gutter = width / 2;
    const slots: Slot[] = pages.map((page, i) => {
        const s = sizes[i];
        const right = pages.length === 1 ? page === 0 : i === 1;
        const x = right ? gutter + RUN_GAP / 2 : gutter - RUN_GAP / 2 - s.w;
        return { page, x: Math.round(x), y: RUN_PAD, w: s.w, h: s.h };
    });
    return { slots, width, height, pages };
}

function overlap(start: number, length: number, from: number, to: number): number {
    return Math.max(0, Math.min(start + length, to) - Math.max(start, from));
}

/**
 * The pages to draw (AC-3, FR-14): those on screen and half a screen either side of it, nearest the
 * middle of the screen first, and never more than `MAX_DRAWN`. Everything else is let go.
 */
export function visibleWindow(slots: readonly Slot[], scroll: Scroll, view: PageSize, across = false, overscan = 0.5, max = MAX_DRAWN): Slot[] {
    const length = across ? view.width : view.height;
    const start = (across ? scroll.left : scroll.top) - overscan * length;
    const end = (across ? scroll.left : scroll.top) + length + overscan * length;
    const middle = (across ? scroll.left : scroll.top) + length / 2;
    const near: { slot: Slot; distance: number }[] = [];
    for (const slot of slots) {
        const a = across ? slot.x : slot.y;
        const b = across ? slot.w : slot.h;
        if (a + b < start || a > end) continue;
        near.push({ slot, distance: Math.abs(a + b / 2 - middle) });
    }
    if (near.length > max) near.sort((p, q) => p.distance - q.distance).splice(max);
    return near.map((entry) => entry.slot).sort((p, q) => p.page - q.page);
}

/** The page most on screen (FR-8): the larger visible share wins, the earlier page on a tie. */
export function mostOnScreen(slots: readonly Slot[], scroll: Scroll, view: PageSize, across = false): number {
    let best = -1;
    let bestSeen = -1;
    for (const slot of slots) {
        const seen = across
            ? overlap(slot.x, slot.w, scroll.left, scroll.left + view.width) * Math.max(1, overlap(slot.y, slot.h, scroll.top, scroll.top + view.height))
            : overlap(slot.y, slot.h, scroll.top, scroll.top + view.height) * Math.max(1, overlap(slot.x, slot.w, scroll.left, scroll.left + view.width));
        if (seen > bestSeen) {
            best = slot.page;
            bestSeen = seen;
        }
    }
    return Math.max(0, best);
}

/** The view a turn of `dir` lands on, as its first page: -1 before the first, `count` past the last. */
export function stepView(page: number, dir: 1 | -1, count: number, layout: ReaderLayout, fits: boolean): number {
    const views = viewsOf(count, layout, fits);
    const next = viewIndexOf(views, page) + dir;
    if (next < 0) return -1;
    if (next >= views.length) return count;
    return views[next][0];
}

/** Where a destination in the paper points: its page, and how far down it the place is (0–1). */
export interface PdfPlace {
    page: number;
    share?: number;
}

/** What a destination needs to be resolved: the document's own lookups. */
export interface DestinationLookup {
    getDestination(name: string): Promise<unknown[] | null>;
    getPageIndex(ref: unknown): Promise<number>;
}

/**
 * A link's destination, resolved (FR-11, AC-7): a named one through the document, an explicit one
 * (`[ref, {name}, …]`) to its page; `XYZ` and `FitH`/`FitBH` say how high on the page, in PDF space
 * (from the bottom), which is returned as `top`. `null` for anything that points nowhere.
 */
export async function resolveDest(dest: unknown, lookup: DestinationLookup): Promise<{ page: number; top?: number } | null> {
    try {
        const explicit: unknown = typeof dest === "string" ? await lookup.getDestination(dest) : dest;
        if (!Array.isArray(explicit) || explicit.length === 0) return null;
        const ref = explicit[0] as unknown;
        const page = typeof ref === "number" ? ref : ref && typeof ref === "object" ? await lookup.getPageIndex(ref) : -1;
        if (!Number.isInteger(page) || page < 0) return null;
        const kind = (explicit[1] as { name?: string } | undefined)?.name;
        const raw: unknown = kind === "XYZ" ? (explicit[3] as unknown) : kind === "FitH" || kind === "FitBH" ? (explicit[2] as unknown) : undefined;
        return typeof raw === "number" && Number.isFinite(raw) ? { page, top: raw } : { page };
    } catch {
        return null;
    }
}

/** A `top` in PDF space (from the bottom of an upright page) as a share down the page as drawn. */
export function shareDown(top: number | undefined, size: PageSize, rotation: number): number | undefined {
    if (top === undefined || !(size.height > 0)) return undefined;
    const r = ((rotation % 360) + 360) % 360;
    if (r !== 0 && r !== 180) return undefined;
    const share = (size.height - top) / size.height;
    const down = r === 180 ? 1 - share : share;
    return Math.min(1, Math.max(0, down));
}

/** What Page view keeps with a paper (FR-5, FR-9): its framing, its direction, its turned pages. */
export interface PageViewState {
    fit?: PageFit;
    zoom?: number;
    across?: boolean;
    /** The pages you turned, by index, a quarter at a time. The PDF itself is never written. */
    rotate?: Record<string, 90 | 180 | 270>;
}

/** A stored view, read: anything malformed reads as the default (AC-4). Never throws. */
export function normalizePageView(raw: unknown): PageViewState {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
    const v = raw as Record<string, unknown>;
    const out: PageViewState = {};
    if (v.fit === "width" || v.fit === "page") out.fit = v.fit;
    if (typeof v.zoom === "number" && Number.isFinite(v.zoom) && v.zoom >= ZOOM_MIN && v.zoom <= ZOOM_MAX) out.zoom = Math.round(v.zoom * 1000) / 1000;
    if (v.across === true) out.across = true;
    if (v.rotate && typeof v.rotate === "object" && !Array.isArray(v.rotate)) {
        const rotate: Record<string, 90 | 180 | 270> = {};
        for (const [key, value] of Object.entries(v.rotate as Record<string, unknown>)) {
            if (/^\d+$/.test(key) && (value === 90 || value === 180 || value === 270)) rotate[key] = value;
        }
        if (Object.keys(rotate).length > 0) out.rotate = rotate;
    }
    // A level and a fit are one framing: the level wins only when no fit is named.
    if (out.fit) delete out.zoom;
    return out;
}

/** A page's turn, a quarter more (FR-9): 0 → 90 → 180 → 270 → 0. */
export function nextRotation(current: number | undefined): 0 | 90 | 180 | 270 {
    const next = (((current ?? 0) + 90) % 360) as 0 | 90 | 180 | 270;
    return next;
}
