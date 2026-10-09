import { c } from "architecture";
import { measure } from "architecture/monitoring/measure";
import { MOTION, motionWelcome } from "./readerMotion";
import { completionRate, releaseTurn, rubberBand } from "./readerGestures";
import {
    CH_PER_EM,
    dragDirection,
    pageCount,
    pageForShare,
    pageGeometry,
    pageHolding,
    scrollTopFor,
    shareOfPage,
    stripOffset,
    viewCount,
    type BookDirection,
    type PageGeometry,
} from "./readerPages";
import type { ReaderLayout } from "./readerPrefs";

/**
 * **The chapter in pages** (#753, epic #739) — the DOM side of `readerPages`. In *Page* and *Spread*
 * the chapter's `<article>` is one strip of CSS columns the size of the screen (`reader.scss`); the
 * pager measures it once, sets its custom properties (never an inline style), and moves the strip with
 * the `translate` property — on the compositor, so a turn lays nothing out.
 *
 * The DOM is never rebuilt: a selection across a page break, the highlight marks, the search tints and
 * the footnotes stay on the same nodes. A place in the text is a `Range` (or the block holding it), so
 * a change of layout, font, size or window lands on the page that holds the line you were reading.
 */

/** A place in the text: a caret where the first line on screen begins, or the block that holds it. */
export type PageAnchor = Range | Element;

/** Where a fresh layout lands: the first page, the last, a share of the chapter, a place, or where it was. */
export type Landing = "start" | "end" | "keep" | { share: number } | { anchor: PageAnchor };

export interface PagerHooks {
    /** The page on screen changed: the hairline, the popovers and the kept place follow. */
    onTurn?: () => void;
}

interface Box {
    left: number;
    top: number;
    width: number;
    height: number;
}

type El = HTMLElement & { win?: Window; doc?: Document };

const px = (n: number) => `${Math.round(n * 100) / 100}px`;
/** The reading size when the page cannot be asked (a test, a page not drawn yet). */
const FALLBACK_FONT_PX = 19;
/** How long after a turn the first line on screen is noted, for a resize to keep. */
const REMEMBER_MS = MOTION.page + 40;

function boxOf(rect: { left: number; top: number; width: number; height: number }): Box {
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/** The first box of a place: the caret, or the first piece of a block a page break cut. */
function firstBox(anchor: PageAnchor): Box | null {
    const pieces = (anchor as { getClientRects?: () => ArrayLike<DOMRect> }).getClientRects?.();
    if (pieces && pieces.length > 0) return boxOf(pieces[0]);
    const rect = anchor.getBoundingClientRect?.();
    return rect ? boxOf(rect) : null;
}

function connected(anchor: PageAnchor | null): anchor is PageAnchor {
    if (!anchor) return false;
    const node = "startContainer" in anchor ? anchor.startContainer : anchor;
    return (node as Node | null)?.isConnected !== false;
}

export class ReaderPager {
    private layout: ReaderLayout = "scroll";
    private direction: BookDirection = "ltr";
    private geometry: PageGeometry | null = null;
    private pages = 1;
    private view = 0;
    /** Where the strip is now, in px. */
    private x = 0;
    private running: Animation | null = null;
    /** A finger on the strip: where it was when the finger came down, and how far it has gone. */
    private dragging: { base: number; dx: number } | null = null;
    /** The first line on screen, noted after each turn — what a resize keeps. */
    private remembered: PageAnchor | null = null;
    /** Landed on the last page (turned back into the chapter): it stays the last while pictures arrive. */
    private atLast = false;
    private rememberTimer: number | undefined;
    /** The stage's size the pages were last laid out for. */
    private size: { width: number; height: number } | null = null;
    private observer: ResizeObserver | null = null;
    private checking = false;

    constructor(
        private readonly stage: HTMLElement,
        private readonly page: HTMLElement,
        private readonly hooks: PagerHooks = {}
    ) {
        // The reader's own window's observer: a pop-out window has its own.
        const Observer = ((stage as El).win as (Window & { ResizeObserver?: typeof ResizeObserver }) | undefined)?.ResizeObserver;
        if (!Observer) return;
        const observer = new Observer((entries: ResizeObserverEntry[]) => this.onResize(entries));
        observer.observe(stage);
        this.observer = observer;
    }

    /** In pages: *Page*, or *Spread* (which may show one page when it does not fit). */
    get paged(): boolean {
        return this.layout !== "scroll";
    }

    /** Pages on screen now: two in a spread that fits, one otherwise. */
    get perView(): 1 | 2 {
        return this.geometry?.perView ?? 1;
    }

    /** Screens in the chapter. */
    get views(): number {
        return viewCount(this.pages, this.perView);
    }

    /** The screen on show, from 0. */
    get current(): number {
        return this.view;
    }

    /** The layout and the book's direction. Back to *Scroll*, the strip is put back at its start. */
    configure(layout: ReaderLayout, direction: BookDirection): void {
        this.layout = layout;
        this.direction = direction;
        if (this.paged) return;
        this.finishRunning();
        this.dragging = null;
        this.geometry = null;
        this.pages = 1;
        this.view = 0;
        this.remembered = null;
        this.setX(0);
    }

    /** A new chapter is about to be drawn: the strip back at its start, so nothing waits off screen. */
    reset(): void {
        this.finishRunning();
        this.dragging = null;
        this.remembered = null;
        this.view = 0;
        this.pages = 1;
        this.setX(0);
    }

    /**
     * Lay the chapter out in pages again, in one task: the new shape is written, read once, and the
     * strip set before the browser paints — the old page stays until the new one is ready (FR-17).
     */
    relayout(land: Landing = "keep"): void {
        if (!this.paged) return;
        measure("reader.paginate", () => this.layoutNow(land));
    }

    private layoutNow(land: Landing): void {
        this.finishRunning();
        this.dragging = null;
        // Kept: the line noted after the last turn, or — when a turn has not been noted yet — the
        // first line on screen now, read from the layout as it still is.
        const kept = land === "keep" && !this.atLast ? (connected(this.remembered) ? this.remembered : this.firstVisible()) : null;
        const anchor = typeof land === "object" && "anchor" in land ? land.anchor : kept;
        // Read now, never cached: an observer's last size can be a frame behind a window resize.
        const size = boxOf(this.stage.getBoundingClientRect());
        this.size = { width: size.width, height: size.height };
        const style = (this.stage as El).win?.getComputedStyle?.(this.page);
        const padTop = parseFloat(style?.paddingTop ?? "") || 0;
        const padBottom = parseFloat(style?.paddingBottom ?? "") || 0;
        const geometry = pageGeometry({ width: size.width, chPx: this.chPx(), layout: this.layout });
        this.geometry = geometry;
        // Writes first — the strip at its start, in its new shape — then one read.
        this.x = 0;
        this.page.setCssProps({
            "--zf-page-w": px(geometry.viewPx),
            "--zf-page-col": px(geometry.columnPx),
            "--zf-page-gap": px(geometry.gapPx),
            "--zf-page-h": px(Math.max(1, size.height - padTop - padBottom)),
            "--zf-page-x": "0px",
        });
        this.fitTables(Math.max(1, size.height - padTop - padBottom));
        this.pages = pageCount(this.page.scrollWidth, geometry.stridePx, geometry.gapPx);
        let view = this.view;
        if (land === "start") view = 0;
        else if (land === "end" || (land === "keep" && this.atLast)) view = this.views - 1;
        else if (typeof land === "object" && "share" in land) view = pageForShare(land.share, this.pages, this.perView);
        else if (anchor) view = this.viewHolding(anchor) ?? view;
        this.view = Math.min(Math.max(0, view), this.views - 1);
        this.atLast = land === "end" || (land === "keep" && this.atLast);
        this.setX(this.offsetOf(this.view));
        if (anchor) this.remembered = anchor;
        else this.rememberSoon();
        if (land === "keep") this.hooks.onTurn?.();
        this.checkSoon();
    }

    /**
     * A frame later, the stage is asked again: a layout taken while the workspace was still moving (a
     * sidebar folding away, a scrollbar going) is taken again at the size the stage settled on.
     */
    private checkSoon(): void {
        const win = (this.stage as El).win;
        if (!win?.requestAnimationFrame || this.checking) return;
        this.checking = true;
        win.requestAnimationFrame(() => {
            this.checking = false;
            const laid = this.size;
            if (!this.paged || !this.geometry || !laid) return;
            const now = this.stage.getBoundingClientRect();
            if (Math.round(now.width) !== Math.round(laid.width) || Math.round(now.height) !== Math.round(laid.height)) this.relayout("keep");
        });
    }

    /** A table taller than a page is scaled to fit it, never cut across two (FR-8). Set once per layout. */
    private fitTables(pageHeight: number): void {
        const fit = c("reader-fit");
        for (const table of Array.from(this.page.querySelectorAll<HTMLElement>("table"))) {
            table.removeClass(fit);
            // Cut across two pages, a table's height is the sum of its pieces.
            const pieces = Array.from(table.getClientRects?.() ?? []);
            const height = pieces.length > 1 ? pieces.reduce((sum, r) => sum + r.height, 0) : table.getBoundingClientRect().height;
            if (height <= pageHeight) continue;
            table.addClass(fit);
            table.setCssProps({ "--zf-fit": String(Math.max(0.2, Math.floor((pageHeight / height) * 1000) / 1000)) });
        }
    }

    /** A `ch` at the reading size, from the body's own font size. */
    private chPx(): number {
        const body = this.page.querySelector<HTMLElement>(`.${c("reader-body")}`) ?? this.page;
        const size = parseFloat((this.stage as El).win?.getComputedStyle?.(body)?.fontSize ?? "");
        return (size > 0 ? size : FALLBACK_FONT_PX) * CH_PER_EM;
    }

    private offsetOf(view: number): number {
        return this.geometry ? stripOffset(view, this.geometry, this.direction) : 0;
    }

    private setX(x: number): void {
        this.x = x;
        this.page.setCssProps({ "--zf-page-x": px(x) });
    }

    private finishRunning(): void {
        const running = this.running;
        this.running = null;
        try {
            running?.finish();
        } catch {
            // Already gone.
        }
    }

    /** Slide the strip from one place to another — or put it there at once, where motion is not welcome. */
    private slide(from: number, to: number, duration: number, rate = 1): void {
        if (from === to || !motionWelcome(this.page)) return;
        const animation = this.page.animate([{ translate: `${px(from)} 0` }, { translate: `${px(to)} 0` }], {
            duration: Math.round(duration / Math.max(1, rate)),
            easing: MOTION.ease,
        });
        this.running = animation;
        animation.onfinish = () => {
            if (this.running === animation) this.running = null;
        };
    }

    /** Whether a turn `dir` stays in the chapter. */
    canTurn(dir: 1 | -1): boolean {
        if (!this.paged) return false;
        return dir > 0 ? this.view < this.views - 1 : this.view > 0;
    }

    atStart(): boolean {
        return this.view <= 0;
    }

    atEnd(): boolean {
        return this.view >= this.views - 1;
    }

    /** How far through the chapter the screen on show is, 0–1: the hairline fills page by page (FR-7). */
    fraction(): number {
        return shareOfPage(this.view, this.pages, this.perView);
    }

    /**
     * Turn a page — two in a spread — the way the book reads (FR-12). A turn still playing ends first,
     * so a held key never queues (FR-15). False at the chapter's end: the view turns the chapter.
     */
    turn(dir: 1 | -1): boolean {
        if (!this.canTurn(dir)) return false;
        this.finishRunning();
        this.dragging = null;
        const from = this.x;
        this.view += dir;
        const to = this.offsetOf(this.view);
        this.setX(to);
        this.slide(from, to, MOTION.page);
        this.turned();
        return true;
    }

    /** Straight to a screen, with no motion: a jump, a search hit, a resumed place. */
    goTo(view: number): void {
        if (!this.paged) return;
        this.finishRunning();
        this.view = Math.min(Math.max(0, view), this.views - 1);
        this.setX(this.offsetOf(this.view));
        this.turned();
    }

    goToShare(share: number): void {
        this.goTo(pageForShare(share, this.pages, this.perView));
    }

    /**
     * The strip under a finger (FR-13), 1:1 — under reduced motion too: direct manipulation is not
     * animation. Where there is no page that way (the first or last page of the book), it follows a third.
     */
    drag(dx: number): void {
        if (!this.paged) return;
        if (!this.dragging) {
            this.finishRunning();
            this.dragging = { base: this.offsetOf(this.view), dx: 0 };
        }
        this.dragging.dx = dx;
        this.atLast = false;
        const dir = dragDirection(dx, this.direction);
        const moved = dir !== 0 && !this.canTurn(dir) ? rubberBand(dx) : dx;
        this.setX(this.dragging.base + moved);
    }

    /**
     * Let go: past a third of the width or on a flick the page turns, at the speed it was let go;
     * short of it, it springs back in the shared beat (250 ms). Instant under reduced motion. A
     * gesture the system took (`force: "spring"`) always springs back.
     */
    release(vx: number, force?: "spring"): "complete" | "spring" {
        const drag = this.dragging;
        this.dragging = null;
        if (!drag || !this.geometry) return "spring";
        const width = this.size?.width ?? this.geometry.viewPx;
        const dir = dragDirection(drag.dx, this.direction);
        const outcome = !force && dir !== 0 && this.canTurn(dir) ? releaseTurn({ dx: drag.dx, width, vx }) : "spring";
        const from = this.x;
        if (outcome === "complete" && dir !== 0) {
            this.view += dir;
            const to = this.offsetOf(this.view);
            this.setX(to);
            const progress = Math.abs(drag.dx) / Math.max(1, width);
            this.slide(from, to, MOTION.page * (1 - Math.min(1, progress)), completionRate(progress, vx, width, MOTION.page));
            this.turned();
            return "complete";
        }
        this.setX(drag.base);
        this.slide(from, drag.base, MOTION.base);
        return "spring";
    }

    /** The screen that holds a place (AC-5), measured on the strip as it is now. */
    viewHolding(anchor: PageAnchor): number | null {
        const geometry = this.geometry;
        const box = firstBox(anchor);
        if (!geometry || !box) return null;
        // The place moves with the strip: measured from the strip's own start, wherever it is now.
        const strip = this.page.getBoundingClientRect();
        const offset = this.direction === "rtl" ? strip.left + strip.width - (box.left + box.width) : box.left - strip.left;
        // A pixel in: a place exactly on a page's first line belongs to that page.
        return pageHolding(offset + 1, geometry.stridePx, geometry.perView, this.views);
    }

    /** Bring a place on screen: the page that holds it, or — in *Scroll* — the stage scrolled to it. */
    reveal(anchor: PageAnchor): void {
        if (!this.paged) {
            const box = firstBox(anchor);
            if (box) this.stage.scrollTop = scrollTopFor(box.top, this.stage.getBoundingClientRect().top, this.stage.scrollTop);
            return;
        }
        const view = this.viewHolding(anchor);
        if (view !== null) this.goTo(view);
    }

    /** The chapter's blocks: the body's children, a lone wrapper looked into (as Obsidian draws one). */
    blocks(): HTMLElement[] {
        let parent = this.page.querySelector<HTMLElement>(`.${c("reader-body")}`);
        if (!parent) return [];
        for (let depth = 0; depth < 3 && parent.children.length === 1 && (parent.firstElementChild?.children.length ?? 0) > 1; depth++) {
            parent = parent.firstElementChild as HTMLElement;
        }
        return Array.from(parent.children) as HTMLElement[];
    }

    /** The blocks on screen now: in the pages on show, or in the stage's scrolled view. */
    visibleBlocks(): HTMLElement[] {
        const view = boxOf(this.stage.getBoundingClientRect());
        return this.blocks().filter((block) => {
            const pieces = (block as { getClientRects?: () => ArrayLike<DOMRect> }).getClientRects?.();
            const boxes = pieces && pieces.length > 0 ? Array.from(pieces).map(boxOf) : [boxOf(block.getBoundingClientRect())];
            return boxes.some((b) => b.left < view.left + view.width && b.left + b.width > view.left && b.top < view.top + view.height && b.top + b.height > view.top);
        });
    }

    /** The block a place is in. */
    blockOf(anchor: PageAnchor | null): HTMLElement | null {
        if (!anchor) return null;
        const node = ("startContainer" in anchor ? anchor.startContainer : anchor) as Node | null;
        return this.blocks().find((block) => block === node || block.contains(node)) ?? null;
    }

    /**
     * The first line on screen (FR-6): a caret where the first visible page — or the scrolled view —
     * begins, asked of the reader's own document; the first block on screen where it cannot be asked.
     */
    firstVisible(): PageAnchor | null {
        const stage = this.stage.getBoundingClientRect();
        const doc = (this.stage as El).doc as (Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }) | undefined;
        const style = (this.stage as El).win?.getComputedStyle?.(this.page);
        const padTop = parseFloat(style?.paddingTop ?? "") || 0;
        let x: number;
        let y: number;
        if (this.paged && this.geometry) {
            // The pages on show sit where the strip's box is when it is not moved: the box minus the move.
            const strip = this.page.getBoundingClientRect();
            const left = strip.left - this.x;
            x = this.direction === "rtl" ? left + strip.width - 8 : left + 8;
            y = strip.top + padTop + 8;
        } else {
            const body = this.page.querySelector<HTMLElement>(`.${c("reader-body")}`)?.getBoundingClientRect() ?? stage;
            x = this.direction === "rtl" ? body.left + body.width - 4 : body.left + 4;
            y = Math.max(stage.top, body.top) + 4;
        }
        let range: Range | null = null;
        // The standard question first; WebKit before 17.4 only answers the older one.
        const older = (doc as unknown as { caretRangeFromPoint?: (x: number, y: number) => Range | null } | undefined)?.caretRangeFromPoint;
        if (doc?.caretPositionFromPoint && doc.createRange) {
            const at = doc.caretPositionFromPoint(x, y);
            if (at) {
                range = doc.createRange();
                range.setStart(at.offsetNode, at.offset);
            }
        } else if (older) range = older.call(doc, x, y);
        if (range && this.page.contains(range.startContainer)) return range;
        return this.visibleBlocks()[0] ?? null;
    }

    /** The tops of the blocks on screen, before a change — what the settle starts from (FR-14). */
    blockTops(): Map<HTMLElement, number> {
        return new Map(this.visibleBlocks().map((block) => [block, block.getBoundingClientRect().top]));
    }

    /** Images and fonts arrive after the text and move it: the pages are counted again, the line kept. */
    contentChanged(): void {
        if (this.paged && this.geometry) this.relayout("keep");
    }

    private turned(): void {
        // The line noted before is no longer on screen.
        this.remembered = null;
        this.atLast = false;
        this.hooks.onTurn?.();
        this.rememberSoon();
    }

    private rememberSoon(): void {
        const win = (this.stage as El).win;
        if (!win) return;
        win.clearTimeout(this.rememberTimer);
        this.rememberTimer = win.setTimeout(() => {
            if (this.paged) this.remembered = this.firstVisible();
        }, REMEMBER_MS);
    }

    /** The window changed shape, or the reading turned (an iPad, a Split View): the line stays (FR-6). */
    private onResize(entries: ResizeObserverEntry[] | undefined): void {
        const rect = entries?.[0]?.contentRect;
        const next = rect ? { width: rect.width, height: rect.height } : null;
        // Against the size the pages were laid out for, not the observer's last word.
        const laid = this.size;
        const changed = !laid || !next || Math.round(next.width) !== Math.round(laid.width) || Math.round(next.height) !== Math.round(laid.height);
        if (changed && this.paged && this.geometry) this.relayout("keep");
    }

    dispose(): void {
        this.observer?.disconnect();
        this.observer = null;
        (this.stage as El).win?.clearTimeout(this.rememberTimer);
        this.finishRunning();
    }
}
