import { Component } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { MOTION, flightTransform, motionWelcome } from "./readerMotion";
import { scrollTravel, TRAVEL_FAINT } from "./readerTravel";
import type { ReaderLayout } from "./readerPrefs";
import type { SourcePageLink, SourcePages, SourcePageTask } from "architecture/components/core/library/sources/sourceDocument";
import {
    WHOLE_PAGE,
    boxInFrame,
    croppedBox,
    frameFor,
    inkOf,
    paperFrames,
    rotateFrame,
    sameBox,
    sampleIndices,
    shareInFrame,
    shareOfPage,
    sharedFrameBox,
    type CropBox,
    type PaperFrames,
} from "application/library/pdfCrop";
import {
    RUN_GAP,
    RUN_PAD,
    ZOOM_MAX,
    ZOOM_MIN,
    ZOOM_STEP,
    clampZoom,
    drawSize,
    mostOnScreen,
    nextRotation,
    normalizePageView,
    pageBox,
    pdfSpreadFits,
    rubberZoom,
    runLayout,
    stepView,
    viewsOf,
    viewIndexOf,
    visibleWindow,
    zoomFor,
    type PageFit,
    type PageSize,
    type PageViewState,
    type RunLayout,
    type Slot,
} from "architecture/components/core/library/sources/pdfPageView";

/**
 * **Page view, grown up** (#767): a PDF's printed pages as **one run of pages drawn only where you
 * look**. *Scroll* is the run scrolled natively, Down or Across; *Page* and *Spread* show the one or
 * two pages of a view and turn with the chapter's own motion (the Reader's `turnFrom`). Every layout
 * shares what is here: the zoom and its gestures, the drawing queue, rotation, and the links.
 *
 * - **Only what is near is drawn** (FR-14): the pages on screen and half a screen around, at most
 *   seven, one pdf.js drawing at a time, nearest first; a page that leaves is cancelled, and its
 *   canvas let go two pages later (`width = 0`, which WebKit counts).
 * - **A gesture never redraws** (FR-17): while fingers pinch or Ctrl+wheel turns, only the run's
 *   transform moves (three custom properties, a compositor change). When it settles, the run is laid
 *   out at the new size in the same frame the transform is cleared — the point under the fingers
 *   kept — and the pages on screen are drawn again, sharp; the old picture stays until the new one
 *   is ready, so the eye only sees the blur clear.
 * - **Every framing is a camera move** (FR-18): *Fit width*, *Fit page*, a level and a double tap
 *   lay the run out once and play it from where it was (FLIP: `translate` + `scale`, 250 ms).
 * - **Pages arrive quietly** (FR-23): a blank sheet with its label, its picture fading in (120 ms)
 *   the first time only.
 *
 * - **Crop margins** (#769): each page is framed on what is printed on it — one frame for the right-hand
 *   pages, one for the left — and the run is laid out and drawn on the frames: a slot is its frame,
 *   a canvas holds only the frame's pixels, links and places are mapped into it. The paper is
 *   measured once (the switch says it is working; nothing moves), then one camera move flies the
 *   page from its sheet into its frame, the line under your eyes kept (FR-9, FR-10).
 *
 * Nothing here writes: what is kept (zoom, direction, turned pages, the crop and its frames) is
 * handed to `onView`, and the Reader keeps it in plugin data — never in the PDF (L5).
 */

/** A gesture is over when it has not moved for this long. */
const SETTLE_MS = 120;
/** How much a wheel notch zooms: e^(−deltaY × rate), a mouse notch of 100 is about a fifth. */
const WHEEL_RATE = 0.0022;
/** A canvas is kept this many pages beyond the window before it is let go. */
const KEEP_AROUND = 2;
/** Two fingers whose spread changed by this share are pinching, not swiping. */
const PINCH_SHARE = 0.08;
/** Faster than a screen in this long is a fling: nothing is drawn until it slows. */
const FLING_MS = 400;
/** A drawing is sharp enough when it is within this share of the size it is shown at. */
const SHARP_ENOUGH = 0.04;

export interface PageRunHost {
    stage: HTMLElement;
    pages: SourcePages;
    /** The Reader's own layout (#753): Scroll, Page or Spread — one control for every reading. */
    layout(): ReaderLayout;
    /** What is kept with the paper. */
    view: PageViewState;
    /** The page most on screen changed (in Scroll), or a view was shown. */
    onPage(index: number): void;
    /** The zoom, the direction or a page's turn changed: keep it with the paper. */
    onView(view: PageViewState): void;
    /** A link to a place in the paper. */
    onLink(target: { page: number; share?: number }): void;
    /** A link that leaves the paper: shown, never followed (FR-12). */
    onOutLink(url: string, anchor: HTMLElement): void;
    /** *Crop margins* changed state — measuring, on, off, or could not measure (#769): the switch follows. */
    onCrop?(): void;
}

/** Where *Crop margins* is (#769): off, measuring the paper, or on. */
export type CropState = "off" | "busy" | "on";

interface Drawn {
    canvas: HTMLCanvasElement;
    /** Device pixels per point it was drawn at. */
    scale: number;
    rotation: number;
    /** The part of the page it holds (#769), as drawn at its turn: the whole page uncropped. */
    frame: CropBox;
    page: number;
}

interface SlotView {
    el: HTMLElement;
    page: number;
    /** The turn and frame the link layer was built for, or null when none was asked yet. */
    linksAt: string | null;
    links: HTMLElement | null;
}

interface Gesture {
    /** The level when the gesture began. */
    base: number;
    /** The level the fingers ask for, unresisted, as a multiple of `base`. */
    raw: number;
    /** The scale on screen now, relative to the laid-out run. */
    s: number;
    tx: number;
    ty: number;
    /** The run's box on screen when the gesture began, untransformed. */
    origin: { left: number; top: number };
    /** The smallest level it may settle at: 50 %, or *Fit page* when that is smaller. */
    min: number;
    /** The last point the gesture was about, in client coordinates. */
    focal: { x: number; y: number };
}

interface Pending {
    page: number;
    task: SourcePageTask;
    canvas: HTMLCanvasElement;
    scale: number;
    rotation: number;
    frame: CropBox;
}

interface ThumbRequest {
    page: number;
    canvas: HTMLCanvasElement;
    width: number;
    cancelled: boolean;
    done: () => void;
}

const px = (n: number) => `${Math.round(n * 100) / 100}px`;

export class PdfPageRun {
    /** The run: sized to every page, holding only the slots near the screen. */
    readonly el: HTMLElement;
    readonly pages: SourcePages;
    private readonly host: PageRunHost;
    private readonly scope = new Component();
    private readonly sizes: PageSize[];
    private readonly known = new Set<number>();
    private fit: PageFit | null;
    private level: number;
    private across: boolean;
    private rotations: Record<string, 90 | 180 | 270>;
    private scale = 1;
    private layoutNow: RunLayout = { slots: [], width: 0, height: 0, pages: [] };
    private current = 0;
    /** The page the Reader was last told is most on screen. */
    private told = -1;
    private readonly slots = new Map<number, SlotView>();
    private readonly drawn = new Map<number, Drawn>();
    private pending: Pending | null = null;
    private readonly thumbs: ThumbRequest[] = [];
    private thumbRunning: ThumbRequest | null = null;
    private gesture: Gesture | null = null;
    private settleTimer: number | undefined;
    private frameAsked = false;
    private sizeFixes = new Set<number>();
    private camera: Animation | null = null;
    private pinch: { d0: number; last: number; mid: { x: number; y: number } } | null = null;
    private lastPinchAt = 0;
    private lastReshape = 0;
    private lastScroll = { top: 0, left: 0, at: 0 };
    private flingTimer: number | undefined;
    private flinging = false;
    private waits = 0;
    private disposed = false;
    /** *Crop margins* (#769): on, the paper's two frames, and what each measured page has printed on it. */
    private cropOn: boolean;
    private frames: PaperFrames | null;
    private readonly inks = new Map<number, CropBox | null>();
    private readonly inking = new Set<number>();
    private measuring = false;
    private cropFailed = false;

    constructor(parent: HTMLElement, host: PageRunHost) {
        this.host = host;
        this.pages = host.pages;
        this.sizes = Array.from({ length: host.pages.count }, () => ({ ...host.pages.first }));
        const view = normalizePageView(host.view);
        this.fit = view.fit ?? (view.zoom === undefined ? "width" : null);
        this.level = view.zoom ?? 1;
        this.across = view.across === true;
        this.rotations = { ...view.rotate };
        this.frames = view.cropFrames ? { right: view.cropFrames.right, left: view.cropFrames.left } : null;
        if (this.frames) {
            // The sampled pages were measured with the frames: their side's frame holds them, or they are whole.
            const whole = new Set(view.cropFrames?.whole ?? []);
            for (const index of sampleIndices(this.pages.count)) this.inks.set(index, whole.has(index) ? null : index % 2 === 0 ? this.frames.right : this.frames.left);
        }
        // Kept on, but measured on another copy of the file: measured again when it is turned on.
        this.cropOn = view.crop === true && this.frames !== null;
        this.el = parent.createDiv({ cls: c("reader-pv-run") });
        this.el.remove();
        this.scope.load();
        this.wire();
    }

    // ── what the Reader asks ─────────────────────────────────────────────────

    /** Put the run in `body` (a chapter just drawn): it outlives the chapter, its pictures too. */
    attach(body: HTMLElement): void {
        body.appendChild(this.el);
    }

    /** The page most on screen, or the first page of the view on show. */
    page(): number {
        return this.current;
    }

    /** The zoom level as the bar says it: a share of *Fit width*. */
    zoomLevel(): number {
        return this.fit ? this.levelOf(this.fit) : this.level;
    }

    /** The framing, when it is one. */
    framing(): PageFit | null {
        return this.fit;
    }

    isAcross(): boolean {
        return this.across;
    }

    /** Whether `page` is on show now — in Scroll, every page is. */
    inView(page: number): boolean {
        return this.host.layout() === "scroll" || this.layoutNow.pages.includes(page);
    }

    /** The view on show in Page and Spread, as its pages. */
    viewPages(): number[] {
        return [...this.layoutNow.pages];
    }

    /** The first page of the view a turn of `dir` from `page` lands on: -1 before the first, the count past the last. */
    stepFrom(page: number, dir: 1 | -1): number {
        return stepView(page, dir, this.pages.count, this.host.layout(), pdfSpreadFits(this.viewSize()));
    }

    /** The views of the paper as it is laid out now (one page, or page 1 alone then pairs). */
    viewsNow(): number[][] {
        return viewsOf(this.pages.count, this.host.layout(), pdfSpreadFits(this.viewSize()));
    }

    /** Show `page` — in Scroll, scrolled to it; in Page and Spread, its view — at `share` down it. */
    show(page: number, share = 0): void {
        this.current = Math.max(0, Math.min(page, this.pages.count - 1));
        this.relayout();
        this.scrollToPage(this.current, share);
        this.sync();
        // Drawn before the reading had its size (a leaf still opening): laid out again once it has.
        if (this.viewSize().width <= 0 && this.waits++ < 10) nextFrame(this.el, () => this.show(this.current, share));
    }

    /**
     * Go to `page` (Scroll; or a place in the view on show): the scroll is set at once and the run
     * carried there from where it was (§XVI), compressed past two screens. Returns how long it takes.
     */
    travelTo(page: number, share = 0, travel = true): number {
        const stage = this.host.stage;
        const before = scrollOf(stage);
        this.current = Math.max(0, Math.min(page, this.pages.count - 1));
        if (!this.inView(this.current)) {
            this.show(this.current, share);
            return 0;
        }
        this.scrollToPage(this.current, share);
        this.sync();
        const after = scrollOf(stage);
        const moved = { x: after.left - before.left, y: after.top - before.top };
        if (!travel || (Math.abs(moved.x) < 1 && Math.abs(moved.y) < 1) || !motionWelcome(this.el)) return 0;
        const across = Math.abs(moved.x) > Math.abs(moved.y);
        const view = this.viewSize();
        const trip = scrollTravel(across ? moved.x : moved.y, across ? view.width : view.height);
        const from = across ? `${px(trip.from)} 0px` : `0px ${px(trip.from)}`;
        const faint = trip.compressed ? { opacity: TRAVEL_FAINT } : {};
        this.camera?.cancel();
        this.camera = this.el.animate([{ translate: from, ...faint }, { translate: "0px 0px", ...(trip.compressed ? { opacity: 1 } : {}) }], {
            duration: trip.duration,
            easing: MOTION.ease,
        });
        return trip.duration;
    }

    /** How far down (or across) the page most on screen the view's top is, 0–1: a resume's place. */
    shareInPage(): number {
        const slot = this.slotOf(this.current);
        if (!slot) return 0;
        const scroll = this.scrollInRun();
        const across = this.across && this.host.layout() === "scroll";
        const inSlot = Math.min(1, Math.max(0, across ? (scroll.left - slot.x) / Math.max(1, slot.w) : (scroll.top - slot.y) / Math.max(1, slot.h)));
        // A share of the page, not of its frame: a place kept with crop on lands the same with it off.
        const frame = this.shownFrame(this.current);
        const share = across ? shareOfPage(inSlot, frame.x, frame.w) : shareOfPage(inSlot, frame.y, frame.h);
        return Math.round(Math.min(1, Math.max(0, share)) * 1000) / 1000;
    }

    /** Where a page sits on screen now (the thumbnail's flight lands there), or null. */
    slotRect(page: number): { left: number; top: number; width: number; height: number } | null {
        const view = this.slots.get(page);
        if (!view) return null;
        const r = view.el.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
    }

    /** A new shape for the reading (a window resized, an iPad turned, a new layout): the page kept. */
    reshape(): void {
        if (this.disposed) return;
        const from = this.scale;
        const focal = this.middle();
        const before = this.pointAt(focal, 1, 0, 0, this.originNow());
        // A window dragged wider reshapes many times a second: only a change on its own is a camera move.
        const now = Date.now();
        const single = now - this.lastReshape > 300;
        this.lastReshape = now;
        this.relayout();
        // The point at the middle of the screen stays there; a page that grew (Fit width on a wider
        // window, deep reading's cover) grows from where it was (#764, §XVI).
        this.land(before, focal, from / this.scale, single);
    }

    /** Down or Across, in Scroll (FR-7): the same page stays on screen. */
    setAcross(across: boolean): void {
        if (across === this.across) return;
        this.across = across;
        this.reshape();
        this.keep();
    }

    /** *Fit width*, *Fit page* or a level, as a camera move about `focal` (the view's middle if none). */
    frame(target: PageFit | number, focal?: { x: number; y: number }): void {
        this.finishGesture();
        const from = this.scale;
        const point = focal ?? this.middle();
        const before = this.pointAt(point, 1, 0, 0, this.originNow());
        if (typeof target === "number") {
            this.fit = null;
            this.level = clampZoom(target);
        } else {
            this.fit = target;
        }
        this.relayout();
        this.land(before, point, from / this.scale);
        this.keep();
    }

    /** + or −, a step of a fifth; the level stays between 50 % and 400 % (FR-2). */
    zoomStep(dir: 1 | -1, focal?: { x: number; y: number }): void {
        const now = this.zoomLevel();
        const next = dir > 0 ? now * ZOOM_STEP : now / ZOOM_STEP;
        this.frame(Math.min(ZOOM_MAX, Math.max(Math.min(ZOOM_MIN, now), next)), focal);
    }

    /** A double tap (FR-2): *Fit width*, or twice that, about the tap. */
    doubleTap(point: { x: number; y: number }): void {
        const now = this.zoomLevel();
        this.frame(this.fit === "width" || Math.abs(now - 1) < 0.02 ? 2 : "width", point);
    }

    /** Ctrl/⌘ + wheel, or a trackpad's pinch (Chromium delivers it as one): the run follows at once. */
    wheelZoom(event: WheelEvent): void {
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.viewSize().height : 1;
        this.zoomBy(Math.exp(-event.deltaY * unit * WHEEL_RATE), { x: event.clientX, y: event.clientY });
        this.armSettle();
    }

    /** Whether two fingers pinched a moment ago — they were not a two-finger swipe back (#761). */
    pinchedRecently(): boolean {
        return Date.now() - this.lastPinchAt < 600;
    }

    /** Whether the run is wider than the view: a sideways drag pans it, never turns a page. */
    overflowsAcross(): boolean {
        return this.layoutNow.width > this.viewSize().width + 1;
    }

    /** *Rotate page* (FR-9, FR-21): the page most on screen turns a quarter, then is drawn upright. */
    rotate(page = this.current): void {
        const before = this.slots.get(page)?.el.getBoundingClientRect();
        const next = nextRotation(this.rotationOf(page));
        if (next === 0) delete this.rotations[String(page)];
        else this.rotations[String(page)] = next;
        // The page takes its new shape at once — its picture held turned inside it until it is drawn
        // upright — and is played from where it was: a quarter turn, growing or shrinking into its
        // new place (FLIP: translate, rotate and scale only), so its size never cuts (FR-21).
        const share = this.shareInPage();
        this.relayout();
        this.scrollToPage(this.current, share);
        this.sync();
        this.keep();
        const view = this.slots.get(page);
        if (!view || !before || !motionWelcome(view.el)) return;
        const after = view.el.getBoundingClientRect();
        if (!(after.width > 0) || !(after.height > 0)) return;
        const dx = before.left + before.width / 2 - (after.left + after.width / 2);
        const dy = before.top + before.height / 2 - (after.top + after.height / 2);
        const k = Math.round((before.height / after.width) * 10000) / 10000;
        view.el.animate(
            [
                { translate: `${px(dx)} ${px(dy)}`, rotate: "-90deg", scale: String(k) },
                { translate: "0px 0px", rotate: "0deg", scale: "1" },
            ],
            { duration: MOTION.base, easing: MOTION.ease }
        );
    }

    /**
     * A thumbnail of `page`, `width` CSS pixels wide, drawn through the same queue as the pages — after
     * them. Returns its cancel, for a thumbnail that leaves the list before it is drawn.
     */
    drawThumb(page: number, canvas: HTMLCanvasElement, width: number, done: () => void = () => undefined): () => void {
        const request: ThumbRequest = { page, canvas, width, cancelled: false, done };
        this.thumbs.push(request);
        this.pump();
        return () => {
            request.cancelled = true;
        };
    }

    /** Where *Crop margins* is (#769). */
    cropState(): CropState {
        if (this.measuring) return "busy";
        return this.cropOn ? "on" : "off";
    }

    /** The paper could not be measured the last time crop was turned on (#769): the switch says so. */
    cropCouldNotMeasure(): boolean {
        return this.cropFailed;
    }

    /** A thumbnail's shape, height over width: the page as it is read — on its frame with crop on. */
    thumbRatio(page: number): number {
        const box = this.boxOf(page);
        return box.height / Math.max(1e-6, box.width);
    }

    /** Whether the source can say what is printed on its pages at all. */
    canCrop(): boolean {
        return typeof this.pages.ink === "function";
    }

    /**
     * *Crop margins* on or off (#769). The first time for a paper, its sampled pages are measured
     * first — the switch says it is working and nothing moves (FR-10) — then **one camera move**: the
     * page flies from its sheet into its frame, the line under your eyes kept (FR-9); off is the same
     * move backwards; under reduced motion, at once (FR-11). A paper that cannot be measured stays
     * uncropped, says so once, and logs why.
     */
    async setCrop(on: boolean): Promise<void> {
        if (this.disposed || this.measuring || on === this.cropOn) return;
        this.cropFailed = false;
        if (on && !this.frames) {
            this.measuring = true;
            this.host.onCrop?.();
            let frames: PaperFrames | null = null;
            try {
                frames = await this.measure();
            } catch (error) {
                log.warn(`[Reader] the margins could not be measured: ${String(error)}`);
            }
            this.measuring = false;
            if (this.disposed) return;
            if (!frames) {
                this.cropFailed = true;
                this.host.onCrop?.();
                return;
            }
            this.frames = frames;
        }
        this.cropMove(on);
        this.host.onCrop?.();
    }

    /** The frames as kept with the paper, with the sampled pages that are shown whole. */
    private keptFrames(frames: PaperFrames): { right: CropBox; left: CropBox; whole?: number[] } {
        const whole = sampleIndices(this.pages.count).filter((index) => this.inks.get(index) === null);
        return { right: frames.right, left: frames.left, ...(whole.length > 0 ? { whole } : {}) };
    }

    /** The paper's sampled pages, measured; their frames — or `null` when not one page could be. */
    private async measure(): Promise<PaperFrames | null> {
        const ink = this.pages.ink?.bind(this.pages);
        if (!ink) return null;
        const indices = sampleIndices(this.pages.count);
        const samples = await Promise.all(indices.map(async (index) => ({ index, ink: inkOf(await ink(index)) })));
        for (const sample of samples) this.inks.set(sample.index, sample.ink);
        const frames = paperFrames(samples);
        if (!frames) log.warn("[Reader] the margins could not be measured: no sampled page has text that can be placed");
        return frames;
    }

    /**
     * The camera move into the frame, or out of it (FR-9, §XVI). What is on screen now is copied into
     * a ghost over the stage; under it the run is laid out on the new frames at once, scrolled so the
     * point at the middle of the screen is still there; then the ghost flies — scale and translate
     * only, one animation — from where the page was to where that same part of the page now is, and
     * fades into the page under it. The stage clips it. Under reduced motion there is no ghost.
     */
    private cropMove(on: boolean): void {
        this.finishGesture();
        const focal = this.middle();
        const origin = this.originNow();
        const before = this.pointAt(focal, 1, 0, 0, origin);
        const page = before?.page ?? this.current;
        const was = this.shownFrame(page);
        const fromSlot = this.screenBox(page, origin);
        const ghost = motionWelcome(this.el) && fromSlot ? this.cropGhost(origin) : null;
        this.cropOn = on;
        this.camera?.cancel();
        this.camera = null;
        this.relayout();
        const now = this.shownFrame(page);
        // The point under the eyes, as a share of the page, then of the page's new frame.
        const kept = before
            ? { page, fx: shareInFrame(shareOfPage(before.fx, was.x, was.w), now.x, now.w), fy: shareInFrame(shareOfPage(before.fy, was.y, was.h), now.y, now.h) }
            : null;
        this.land(kept, focal, 1, false);
        this.keep();
        const toSlot = this.screenBox(page, this.originNow());
        if (!ghost || !fromSlot || !toSlot) {
            ghost?.clip.remove();
            return;
        }
        // Where the part of the page shown before now sits on screen.
        const at = boxInFrame(was, now);
        const to = { left: toSlot.left + at.x * toSlot.width, top: toSlot.top + at.y * toSlot.height, width: at.w * toSlot.width, height: at.h * toSlot.height };
        this.flyGhost(ghost, fromSlot, to);
    }

    /** A page's slot on screen, from the layout (the DOM's own box may not be laid out yet). */
    private screenBox(page: number, origin: { left: number; top: number }): { left: number; top: number; width: number; height: number } | null {
        const slot = this.slotOf(page);
        return slot ? { left: origin.left + slot.x, top: origin.top + slot.y, width: slot.w, height: slot.h } : null;
    }

    /**
     * The ghost: a clip the size of the stage, over it, holding a camera layer (larger than the
     * stage, so it still covers it while it draws back) with a copy of every page on screen.
     */
    private cropGhost(origin: { left: number; top: number }): { clip: HTMLElement; camera: HTMLElement; stage: DOMRect | { left: number; top: number; width: number; height: number } } | null {
        const stage = this.host.stage;
        const parent = stage.parentElement;
        if (!parent) return null;
        const box = stage.getBoundingClientRect();
        const host = parent.getBoundingClientRect();
        const clip = parent.createDiv({ cls: [c("motion-ghost"), c("reader-pv-crop-clip")], attr: { "aria-hidden": "true" } });
        clip.setCssProps({ "--zf-ghost-x": px(box.left - host.left), "--zf-ghost-y": px(box.top - host.top), "--zf-ghost-w": px(box.width), "--zf-ghost-h": px(box.height) });
        const camera = clip.createDiv({ cls: c("reader-pv-crop-camera") });
        for (const [page, view] of this.slots) {
            const slot = this.screenBox(page, origin);
            if (!slot || slot.top > box.top + box.height || slot.top + slot.height < box.top || slot.left > box.left + box.width || slot.left + slot.width < box.left) continue;
            // In the camera layer, which starts a stage's width and height before the stage.
            const sheet = camera.createDiv({ cls: c("reader-pv-crop-sheet") });
            sheet.setCssProps({
                "--zf-slot-x": px(slot.left - box.left + box.width),
                "--zf-slot-y": px(slot.top - box.top + box.height),
                "--zf-slot-w": px(slot.width),
                "--zf-slot-h": px(slot.height),
            });
            const drawn = this.drawn.get(page);
            const picture = drawn?.canvas;
            // A picture held turned (a page turned a moment ago) is left as its sheet.
            if (!drawn || !picture || !(picture.width > 0) || picture.parentElement !== view.el || drawn.rotation !== this.rotationOf(page)) continue;
            const framed = this.framedProps(drawn);
            const copy = sheet.createEl("canvas", { cls: [c("reader-pv-canvas"), ...(framed ? [c("reader-pv-canvas--framed")] : [])] });
            copy.width = picture.width;
            copy.height = picture.height;
            if (framed) copy.setCssProps(framed);
            copy.getContext?.("2d")?.drawImage(picture, 0, 0);
        }
        return { clip, camera, stage: box };
    }

    private flyGhost(ghost: { clip: HTMLElement; camera: HTMLElement; stage: { left: number; top: number; width: number; height: number } }, from: { left: number; top: number; width: number; height: number }, to: { left: number; top: number; width: number; height: number }): void {
        const { clip, camera, stage } = ghost;
        // The move is about the page's corner, so `flightTransform` carries the page box onto its new box.
        camera.setCssProps({ "--zf-crop-ox": px(from.left - stage.left + stage.width), "--zf-crop-oy": px(from.top - stage.top + stage.height) });
        const done = () => clip.remove();
        const animation = camera.animate(
            [
                { transform: "translate(0px, 0px) scale(1, 1)", opacity: 1 },
                { opacity: 1, offset: 0.7 },
                { transform: flightTransform(from, to), opacity: 0 },
            ],
            { duration: MOTION.cover, easing: MOTION.ease, fill: "forwards" }
        );
        animation.onfinish = done;
        animation.oncancel = done;
        this.el.win.setTimeout(done, MOTION.cover + 300);
    }

    /** The run is going: its drawings are cancelled and its canvases let go. */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.el.win?.clearTimeout(this.settleTimer);
        this.el.win?.clearTimeout(this.flingTimer);
        this.pending?.task.cancel();
        this.pending = null;
        for (const request of this.thumbs) request.cancelled = true;
        this.thumbs.length = 0;
        for (const drawn of this.drawn.values()) release(drawn.canvas);
        this.drawn.clear();
        this.slots.clear();
        this.camera?.cancel();
        this.scope.unload();
        this.el.remove();
    }

    // ── the layout ───────────────────────────────────────────────────────────

    private rotationOf(page: number): number {
        return this.rotations[String(page)] ?? 0;
    }

    /** The part of a page shown, upright (#769): its frame with crop on, the whole page otherwise. */
    private frameOf(page: number): CropBox {
        if (!this.cropOn || !this.frames) return WHOLE_PAGE;
        return frameFor(page, this.frames, this.inks.has(page) ? this.inks.get(page) : undefined);
    }

    /** The part of a page shown, at its turn. */
    private shownFrame(page: number): CropBox {
        const frame = this.frameOf(page);
        return frame === WHOLE_PAGE ? WHOLE_PAGE : rotateFrame(frame, this.rotationOf(page));
    }

    /** A page's box as laid out: its size at its turn, cut to its frame. */
    private boxOf(page: number): PageSize {
        const box = pageBox(this.sizes[page] ?? this.pages.first, this.rotationOf(page));
        const frame = this.shownFrame(page);
        return frame === WHOLE_PAGE ? box : croppedBox(box, frame);
    }

    private viewSize(): PageSize {
        const stage = this.host.stage;
        const box = stage.getBoundingClientRect();
        return { width: stage.clientWidth || box.width || 0, height: stage.clientHeight || box.height || 0 };
    }

    /** Where the run starts in the stage's scrolled content — below the hint, at the page's edge. */
    private originInStage(): { left: number; top: number } {
        const stage = this.host.stage.getBoundingClientRect();
        const run = this.originNow();
        const scroll = scrollOf(this.host.stage);
        return { left: run.left - stage.left + scroll.left, top: run.top - stage.top + scroll.top };
    }

    /** The run's box on screen, as laid out (any gesture's transform taken out). */
    private originNow(): { left: number; top: number } {
        const r = this.el.getBoundingClientRect();
        const g = this.gesture;
        if (!g) return { left: r.left, top: r.top };
        return { left: r.left - g.tx, top: r.top - g.ty };
    }

    /** The scroll, in the run's own coordinates. */
    private scrollInRun(): { left: number; top: number } {
        const origin = this.originInStage();
        const scroll = scrollOf(this.host.stage);
        return { left: scroll.left - origin.left, top: scroll.top - origin.top };
    }

    private columns(layout: ReaderLayout, view: PageSize): number {
        return layout === "spread" && pdfSpreadFits(view) ? 2 : 1;
    }

    /** The page the framing fits: the first page in Scroll (one scale for the paper), the view's otherwise. */
    private framed(layout: ReaderLayout): PageSize {
        const views = layout === "scroll" ? [[0]] : this.viewsNow();
        const pages = layout === "scroll" ? [0] : (views[viewIndexOf(views, this.current)] ?? [this.current]);
        const frames = this.cropOn ? this.frames : null;
        // With crop on, the paper's frames — the wider and the taller of the two — and never one page's
        // own: every page is drawn at one scale, so the text keeps its size as you turn (#769 FR-3).
        const boxes = pages.map((p) => {
            const box = pageBox(this.sizes[p] ?? this.pages.first, this.rotationOf(p));
            return frames ? sharedFrameBox(box, frames, this.rotationOf(p)) : box;
        });
        return { width: Math.max(...boxes.map((b) => b.width)), height: Math.max(...boxes.map((b) => b.height)) };
    }

    /** The room a framing fits in: in Page and Spread, below the hint; in Scroll, the whole view. */
    private fitView(layout: ReaderLayout): PageSize {
        const view = this.viewSize();
        if (layout === "scroll") return view;
        const top = Math.max(0, this.originInStage().top);
        return { width: view.width, height: Math.max(1, view.height - top) };
    }

    /** The level a framing comes to, as a share of *Fit width*. */
    private levelOf(fit: PageFit): number {
        const layout = this.host.layout();
        const view = this.fitView(layout);
        const box = this.framed(layout);
        const columns = this.columns(layout, view);
        return zoomFor(fit, box, view, columns) / zoomFor("width", box, view, columns);
    }

    private relayout(): void {
        const layout = this.host.layout();
        const view = this.viewSize();
        const fitView = this.fitView(layout);
        const columns = this.columns(layout, view);
        this.scale = zoomFor(this.fit ?? this.level, this.framed(layout), fitView, columns);
        const boxes = this.sizes.map((_, i) => this.boxOf(i));
        this.layoutNow = runLayout(boxes, {
            layout,
            across: layout === "scroll" && this.across,
            scale: this.scale,
            view,
            current: this.current,
            fits: pdfSpreadFits(view),
            ...(this.fit ? { capWidth: Math.max(1, (fitView.width - 2 * RUN_PAD - (columns - 1) * RUN_GAP) / columns) } : {}),
        });
        this.el.toggleClass(c("reader-pv-run--across"), layout === "scroll" && this.across);
        this.el.setCssProps({ "--zf-run-w": px(this.layoutNow.width), "--zf-run-h": px(this.layoutNow.height) });
    }

    private slotOf(page: number): Slot | undefined {
        return this.layoutNow.slots.find((slot) => slot.page === page);
    }

    private scrollToPage(page: number, pageShare: number): void {
        const stage = this.host.stage;
        const slot = this.slotOf(page);
        // A share of the page, as a share of its frame (#769): a jump lands on the same line, cropped or not.
        const frame = this.shownFrame(page);
        const alongX = this.host.layout() === "scroll" && this.across;
        const mapped = pageShare > 0 ? shareInFrame(pageShare, alongX ? frame.x : frame.y, alongX ? frame.w : frame.h) : 0;
        const share = Math.min(1, Math.max(0, mapped));
        const origin = this.originInStage();
        const view = this.viewSize();
        if (!slot) return;
        if (this.host.layout() === "scroll") {
            if (this.across) {
                stage.scrollLeft = Math.max(0, origin.left + slot.x + share * slot.w - (share > 0 ? 0 : RUN_PAD));
                stage.scrollTop = Math.max(0, origin.top + (this.layoutNow.height - view.height) / 2);
            } else {
                // The first page, from its top: the paper from its very start, the hint above it in view.
                stage.scrollTop = page === 0 && share === 0 ? 0 : Math.max(0, origin.top + slot.y + share * slot.h - (share > 0 ? 0 : RUN_PAD));
                stage.scrollLeft = Math.max(0, origin.left + (this.layoutNow.width - view.width) / 2);
            }
            return;
        }
        stage.scrollTop = share > 0 ? Math.max(0, origin.top + slot.y + share * slot.h) : 0;
        stage.scrollLeft = Math.max(0, origin.left + (this.layoutNow.width - view.width) / 2);
    }

    // ── what is drawn ────────────────────────────────────────────────────────

    /** The slots near the screen, made or let go; the page most on screen; and what to draw next. */
    private sync(): void {
        if (this.disposed) return;
        const layout = this.host.layout();
        const view = this.viewSize();
        const scroll = this.scrollInRun();
        const across = layout === "scroll" && this.across;
        const near = layout === "scroll" ? visibleWindow(this.layoutNow.slots, scroll, view, across) : this.layoutNow.slots;
        const wanted = new Set(near.map((slot) => slot.page));
        for (const [page, view] of this.slots) {
            if (wanted.has(page)) continue;
            view.el.remove();
            this.slots.delete(page);
        }
        for (const slot of near) this.place(slot);
        // Canvases far from the window are let go (FR-14): the window, two pages either side.
        const lo = Math.min(...near.map((s) => s.page)) - KEEP_AROUND;
        const hi = Math.max(...near.map((s) => s.page)) + KEEP_AROUND;
        for (const [page, drawn] of this.drawn) {
            if (page >= lo && page <= hi) continue;
            release(drawn.canvas);
            this.drawn.delete(page);
        }
        if (layout === "scroll" && near.length > 0) {
            const most = mostOnScreen(near, scroll, view, across);
            this.current = most;
            if (most !== this.told) {
                this.told = most;
                this.host.onPage(most);
            }
        }
        this.askSizes(near);
        // A fling is the platform's (FR-19): pages flying past are not drawn — a drawing paints on the
        // main thread and would cost the fling its frames. They are drawn once the scroll slows.
        const now = Date.now();
        const moved = Math.abs(scroll.top - this.lastScroll.top) + Math.abs(scroll.left - this.lastScroll.left);
        const dt = Math.max(1, now - this.lastScroll.at);
        this.lastScroll = { top: scroll.top, left: scroll.left, at: now };
        if (moved / dt > (across ? view.width : view.height) / FLING_MS) {
            this.flinging = true;
            this.el.win.clearTimeout(this.flingTimer);
            this.flingTimer = this.el.win.setTimeout(() => {
                this.flinging = false;
                this.pump();
            }, SETTLE_MS);
            return;
        }
        this.pump();
    }

    /** A slot where its page sits: a blank sheet with its label until its picture is there (FR-23). */
    private place(slot: Slot): void {
        let view = this.slots.get(slot.page);
        if (!view) {
            const label = this.pages.label(slot.page);
            const el = this.el.createDiv({
                cls: c("reader-pv-slot"),
                // Named by its label, read as text: an aria-label would be Obsidian's tooltip over the page.
                attr: { "data-page": String(slot.page) },
            });
            el.createSpan({ cls: c("reader-pv-slot-label"), text: t("reader_source_page", label) });
            view = { el, page: slot.page, linksAt: null, links: null };
            this.slots.set(slot.page, view);
            // Drawn already, a moment ago: shown again at once, without a fade.
            const drawn = this.drawn.get(slot.page);
            if (drawn) {
                el.appendChild(drawn.canvas);
                this.linksFor(view);
            }
        }
        view.el.setCssProps({ "--zf-slot-x": px(slot.x), "--zf-slot-y": px(slot.y), "--zf-slot-w": px(slot.w), "--zf-slot-h": px(slot.h) });
        this.fitCanvas(view, slot);
    }

    /** A picture drawn at another turn sits turned inside its slot until it is drawn again (FR-21). */
    private fitCanvas(view: SlotView, slot: Slot): void {
        const drawn = this.drawn.get(view.page);
        if (!drawn) return;
        const delta = (((this.rotationOf(view.page) - drawn.rotation) % 360) + 360) % 360;
        drawn.canvas.toggleClass(c("reader-pv-canvas--turned"), delta !== 0);
        // A picture of another frame (crop just turned on or off, #769) sits where its part of the page
        // now is, clipped by the slot, until the page is drawn again on its frame.
        const framed = delta === 0 ? this.framedProps(drawn) : null;
        drawn.canvas.toggleClass(c("reader-pv-canvas--framed"), framed !== null);
        if (framed) drawn.canvas.setCssProps(framed);
        if (delta === 0) return;
        const quarter = delta % 180 === 90;
        drawn.canvas.setCssProps({ "--zf-turn": `${delta}deg`, "--zf-turn-w": px(quarter ? slot.h : slot.w), "--zf-turn-h": px(quarter ? slot.w : slot.h) });
    }

    /** Where a picture of another frame sits in its slot, as shares of it — `null` when it is the slot's own. */
    private framedProps(drawn: Drawn): Record<string, string> | null {
        const frame = this.shownFrame(drawn.page);
        if (sameBox(drawn.frame, frame)) return null;
        const at = boxInFrame(drawn.frame, frame);
        const pct = (n: number) => `${Math.round(n * 100000) / 1000}%`;
        return { "--zf-cv-x": pct(at.x), "--zf-cv-y": pct(at.y), "--zf-cv-w": pct(at.w), "--zf-cv-h": pct(at.h) };
    }

    /** Every page starts as the first page's size; a page near the screen is read for its own. */
    private askSizes(near: readonly Slot[]): void {
        for (const slot of near) this.askInk(slot.page);
        for (const slot of near) {
            const page = slot.page;
            if (this.known.has(page)) continue;
            this.known.add(page);
            void this.pages
                .size(page)
                .then((size) => {
                    const now = this.sizes[page];
                    if (this.disposed || !now || (Math.abs(now.width - size.width) < 0.5 && Math.abs(now.height - size.height) < 0.5)) return;
                    this.sizes[page] = size;
                    this.fixSizes(page);
                })
                .catch((error: unknown) => log.debug(`[Reader] no size for page ${page + 1}: ${String(error)}`));
        }
    }

    /**
     * With crop on, a page not sampled is measured when it comes near (#769 FR-2): one with more
     * printed on it than its side's frame keeps it all — laid out again like a page of another size.
     */
    private askInk(page: number): void {
        const ink = this.pages.ink?.bind(this.pages);
        if (!this.cropOn || !this.frames || !ink || this.inks.has(page) || this.inking.has(page)) return;
        this.inking.add(page);
        const before = this.frameOf(page);
        void ink(page)
            .then((measured) => inkOf(measured))
            .catch((error: unknown) => {
                log.debug(`[Reader] page ${page + 1} not measured, shown whole: ${String(error)}`);
                return null;
            })
            .then((box) => {
                this.inking.delete(page);
                if (this.disposed) return;
                this.inks.set(page, box);
                if (this.cropOn && !sameBox(before, this.frameOf(page))) this.fixSizes(page);
            });
    }

    /** Pages that turned out another size: laid out again once a frame, the page you read kept still. */
    private fixSizes(page: number): void {
        this.sizeFixes.add(page);
        if (this.sizeFixes.size > 1) return;
        nextFrame(this.el, () => {
            this.sizeFixes.clear();
            if (this.disposed) return;
            const share = this.shareInPage();
            this.relayout();
            this.scrollToPage(this.current, share);
            this.sync();
        });
    }

    /** The device pixels per point a slot is drawn at: its size on screen, capped (FR-4, AC-2). */
    private wantedScale(slot: Slot): number {
        const ratio = this.el.win?.devicePixelRatio || 1;
        // The slot is the frame: the scale is its pixels over the frame's points (#769).
        const box = this.boxOf(slot.page);
        return drawSize(slot.w, slot.h, ratio).width / Math.max(1e-6, box.width);
    }

    private needsDrawing(slot: Slot): boolean {
        const drawn = this.drawn.get(slot.page);
        if (!drawn || drawn.rotation !== this.rotationOf(slot.page) || !sameBox(drawn.frame, this.shownFrame(slot.page))) return true;
        const want = this.wantedScale(slot);
        return Math.abs(drawn.scale - want) / want > SHARP_ENOUGH;
    }

    /** One drawing at a time: the page nearest the middle of the screen first, then the thumbnails. */
    private pump(): void {
        if (this.disposed) return;
        const near = [...this.slots.keys()].map((page) => this.slotOf(page)).filter((slot): slot is Slot => Boolean(slot));
        const running = this.pending;
        if (running) {
            const slot = near.find((s) => s.page === running.page);
            // A page that left the screen, or whose turn changed, is let go (FR-14).
            if (!slot || running.rotation !== this.rotationOf(running.page) || !sameBox(running.frame, this.shownFrame(running.page))) {
                running.task.cancel();
                release(running.canvas);
                this.pending = null;
            } else return;
        }
        if (this.thumbRunning || this.gesture || this.flinging) return;
        const view = this.viewSize();
        const scroll = this.scrollInRun();
        const middle = { x: scroll.left + view.width / 2, y: scroll.top + view.height / 2 };
        const next = near
            .filter((slot) => this.needsDrawing(slot))
            .sort((a, b) => Math.hypot(a.x + a.w / 2 - middle.x, a.y + a.h / 2 - middle.y) - Math.hypot(b.x + b.w / 2 - middle.x, b.y + b.h / 2 - middle.y))[0];
        if (next) {
            this.drawPage(next);
            return;
        }
        this.drawNextThumb();
    }

    private drawPage(slot: Slot): void {
        const page = slot.page;
        const rotation = this.rotationOf(page);
        const scale = this.wantedScale(slot);
        const frame = this.shownFrame(page);
        const canvas = this.el.createEl("canvas", { cls: c("reader-pv-canvas") });
        canvas.remove();
        const task = this.pages.render(page, canvas, { scale, rotation, ...(frame === WHOLE_PAGE ? {} : { frame }) });
        const pending: Pending = { page, task, canvas, scale, rotation, frame };
        this.pending = pending;
        void task.promise
            .then(() => {
                if (this.pending !== pending) return;
                this.pending = null;
                if (this.disposed) {
                    release(canvas);
                    return;
                }
                this.takeDrawing(pending);
            })
            .catch((error: unknown) => {
                if (this.pending === pending) this.pending = null;
                log.debug(`[Reader] page ${page + 1} not drawn: ${String(error)}`);
            })
            .finally(() => this.pump());
    }

    /** A drawing is in: it takes its slot's place — the first one fades in, a sharper one just replaces. */
    private takeDrawing(pending: Pending): void {
        const previous = this.drawn.get(pending.page);
        this.drawn.set(pending.page, { canvas: pending.canvas, scale: pending.scale, rotation: pending.rotation, frame: pending.frame, page: pending.page });
        const view = this.slots.get(pending.page);
        if (!view) {
            if (previous) release(previous.canvas);
            return;
        }
        if (previous && previous.canvas.parentElement === view.el) previous.canvas.replaceWith(pending.canvas);
        else view.el.appendChild(pending.canvas);
        // The label waits under the picture; the links lie over it.
        if (view.links) view.el.appendChild(view.links);
        if (previous && previous.canvas !== pending.canvas) release(previous.canvas);
        const slot = this.slotOf(pending.page);
        if (slot) this.fitCanvas(view, slot);
        if (!previous && motionWelcome(pending.canvas)) {
            pending.canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.fast, easing: MOTION.ease });
        }
        this.linksFor(view);
    }

    private drawNextThumb(): void {
        while (this.thumbs.length > 0 && this.thumbs[0].cancelled) this.thumbs.shift();
        const request = this.thumbs.shift();
        if (!request) return;
        this.thumbRunning = request;
        // A thumbnail shows the page as it is read: on its frame, with crop on (#769 FR-5).
        const box = this.boxOf(request.page);
        const frame = this.shownFrame(request.page);
        const ratio = this.el.win?.devicePixelRatio || 1;
        const scale = (request.width * ratio) / Math.max(1e-6, box.width);
        const task = this.pages.render(request.page, request.canvas, { scale, rotation: this.rotationOf(request.page), ...(frame === WHOLE_PAGE ? {} : { frame }) });
        void task.promise
            .then(() => {
                if (!this.disposed) request.done();
            })
            .catch((error: unknown) => log.debug(`[Reader] thumbnail ${request.page + 1} not drawn: ${String(error)}`))
            .finally(() => {
                this.thumbRunning = null;
                this.pump();
            });
    }

    // ── links (FR-11, FR-12) ─────────────────────────────────────────────────

    /** The page's links, as buttons over its picture: in the paper they jump; out of it they are shown. */
    private linksFor(view: SlotView): void {
        const rotation = this.rotationOf(view.page);
        const frame = this.shownFrame(view.page);
        const key = `${rotation}|${frame.x},${frame.y},${frame.w},${frame.h}`;
        if (view.linksAt === key) return;
        view.linksAt = key;
        void this.pages.links(view.page, rotation).then((links) => {
            if (this.disposed || view.linksAt !== key || this.slots.get(view.page) !== view) return;
            view.links?.remove();
            view.links = links.length > 0 ? this.linkLayer(view.el, links, frame) : null;
        });
    }

    private linkLayer(slot: HTMLElement, links: readonly SourcePageLink[], frame: CropBox): HTMLElement {
        const layer = slot.createDiv({ cls: c("reader-pv-links") });
        for (const link of links) {
            const button = layer.createEl("button", {
                cls: [c("reader-pv-link"), ...(link.url ? [c("reader-pv-link--out")] : [])],
                attr: { type: "button", "aria-label": link.url ? link.url : t("reader_pv_link_in") },
            });
            // On a cropped page a link sits where its words are in the frame (#769 FR-5).
            const rect = frame === WHOLE_PAGE ? link.rect : boxInFrame(link.rect, frame);
            button.setCssProps({
                "--zf-link-x": `${(rect.x * 100).toFixed(3)}%`,
                "--zf-link-y": `${(rect.y * 100).toFixed(3)}%`,
                "--zf-link-w": `${(rect.w * 100).toFixed(3)}%`,
                "--zf-link-h": `${(rect.h * 100).toFixed(3)}%`,
            });
            this.scope.registerDomEvent(button, "click", (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();
                if (link.url) {
                    this.host.onOutLink(link.url, button);
                    return;
                }
                void this.pages.destination(link.dest, (page) => this.rotationOf(page)).then((target) => {
                    if (target && !this.disposed) this.host.onLink(target);
                });
            });
        }
        return layer;
    }

    // ── zoom ─────────────────────────────────────────────────────────────────

    /** The middle of the view, in client coordinates. */
    private middle(): { x: number; y: number } {
        const r = this.host.stage.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    /**
     * Where a point on screen is in the paper: the page under it and its share across and down that
     * page (or the nearest page), for a run shown at scale `s` and offset `t` from `origin`.
     */
    private pointAt(point: { x: number; y: number }, s: number, tx: number, ty: number, origin: { left: number; top: number }): { page: number; fx: number; fy: number } | null {
        const local = { x: (point.x - origin.left - tx) / s, y: (point.y - origin.top - ty) / s };
        let best: Slot | null = null;
        let bestDistance = Infinity;
        for (const slot of this.layoutNow.slots) {
            const dx = Math.max(slot.x - local.x, 0, local.x - (slot.x + slot.w));
            const dy = Math.max(slot.y - local.y, 0, local.y - (slot.y + slot.h));
            const distance = Math.hypot(dx, dy);
            if (distance < bestDistance) {
                best = slot;
                bestDistance = distance;
            }
            if (distance === 0) break;
        }
        if (!best) return null;
        return { page: best.page, fx: (local.x - best.x) / Math.max(1, best.w), fy: (local.y - best.y) / Math.max(1, best.h) };
    }

    /**
     * The run, just laid out at a new size, put back where the eye was: the point `before` is scrolled
     * under `focal`, and the run plays from scale `k` (what was on screen, against the new layout) to
     * itself, in one camera move — at once under reduced motion. The point under the fingers stays put.
     */
    private land(before: { page: number; fx: number; fy: number } | null, focal: { x: number; y: number }, k: number, animate = true): void {
        const stage = this.host.stage;
        const slot = before ? this.slotOf(before.page) : undefined;
        if (!before || !slot) {
            this.scrollToPage(this.current, 0);
            this.sync();
            return;
        }
        const target = { x: slot.x + before.fx * slot.w, y: slot.y + before.fy * slot.h };
        const stageBox = stage.getBoundingClientRect();
        const origin = this.originInStage();
        stage.scrollLeft = Math.max(0, stageBox.left + origin.left + target.x - focal.x);
        stage.scrollTop = Math.max(0, stageBox.top + origin.top + target.y - focal.y);
        this.sync();
        const now = this.originNow();
        const tr = { x: focal.x - now.left - k * target.x, y: focal.y - now.top - k * target.y };
        this.camera?.cancel();
        this.camera = null;
        if (!animate || !motionWelcome(this.el) || (Math.abs(k - 1) < 0.001 && Math.abs(tr.x) < 0.5 && Math.abs(tr.y) < 0.5)) return;
        this.camera = this.el.animate(
            [
                { translate: `${px(tr.x)} ${px(tr.y)}`, scale: String(Math.round(k * 10000) / 10000) },
                { translate: "0px 0px", scale: "1" },
            ],
            { duration: MOTION.base, easing: MOTION.ease }
        );
    }

    /** A step of a gesture: the run scales about `focal` at once — nothing laid out, nothing drawn. */
    private zoomBy(factor: number, focal: { x: number; y: number }, pan = { x: 0, y: 0 }): void {
        if (!(factor > 0)) return;
        if (!this.gesture) this.beginGesture(focal);
        const g = this.gesture;
        if (!g) return;
        g.raw *= factor;
        const shown = rubberZoom(g.base * g.raw, g.min, ZOOM_MAX) / g.base;
        const k = shown / g.s;
        const p = { x: focal.x - g.origin.left, y: focal.y - g.origin.top };
        g.tx = p.x + k * (g.tx - p.x) + pan.x;
        g.ty = p.y + k * (g.ty - p.y) + pan.y;
        g.s = shown;
        g.focal = focal;
        this.applyGesture();
    }

    private beginGesture(focal: { x: number; y: number }): void {
        this.camera?.finish();
        this.camera = null;
        const r = this.el.getBoundingClientRect();
        const min = Math.min(ZOOM_MIN, this.fit === "page" ? this.levelOf("page") : ZOOM_MIN);
        this.gesture = { base: this.zoomLevel(), raw: 1, s: 1, tx: 0, ty: 0, origin: { left: r.left, top: r.top }, focal, min };
        this.el.addClass(c("reader-pv-run--zooming"));
    }

    private applyGesture(): void {
        const g = this.gesture;
        if (!g) return;
        this.el.setCssProps({ "--zf-run-x": px(g.tx), "--zf-run-y": px(g.ty), "--zf-run-scale": String(Math.round(g.s * 10000) / 10000) });
    }

    private armSettle(): void {
        const win = this.el.win;
        win.clearTimeout(this.settleTimer);
        this.settleTimer = win.setTimeout(() => this.settle(), SETTLE_MS);
    }

    /** A gesture still under way, ended where it is (a framing asked for in the middle of one). */
    private finishGesture(): void {
        if (this.gesture) this.settle();
    }

    /**
     * The gesture is over (FR-17): the run is laid out at the level asked for — past a limit, at the
     * limit — in the very frame its transform is cleared, so nothing jumps; it springs back from where
     * the fingers left it; and the pages on screen are drawn again, sharp.
     */
    private settle(): void {
        const g = this.gesture;
        this.el.win.clearTimeout(this.settleTimer);
        if (!g) return;
        const before = this.pointAt(g.focal, g.s, g.tx, g.ty, g.origin);
        const shownScale = this.scale * g.s;
        this.gesture = null;
        this.el.removeClass(c("reader-pv-run--zooming"));
        this.el.setCssProps({ "--zf-run-x": "0px", "--zf-run-y": "0px", "--zf-run-scale": "1" });
        const asked = g.base * g.raw;
        this.fit = null;
        this.level = Math.min(ZOOM_MAX, Math.max(g.min, asked));
        this.relayout();
        this.land(before, g.focal, shownScale / this.scale);
        this.keep();
    }

    /** What is kept with the paper: the framing or the level, the direction, the turned pages. */
    private keep(): void {
        const view: PageViewState = {
            ...(this.fit ? { fit: this.fit } : { zoom: Math.round(this.level * 1000) / 1000 }),
            ...(this.across ? { across: true } : {}),
            ...(Object.keys(this.rotations).length > 0 ? { rotate: { ...this.rotations } } : {}),
            ...(this.cropOn ? { crop: true as const } : {}),
            // The frames, once measured, are kept whether crop is on or off: turned on again, it moves at once.
            ...(this.frames ? { cropFrames: this.keptFrames(this.frames) } : {}),
        };
        // *Fit width* is the default: nothing to keep for it.
        if (view.fit === "width") delete view.fit;
        this.host.onView(view);
    }

    // ── events ───────────────────────────────────────────────────────────────

    private wire(): void {
        const stage = this.host.stage;
        this.scope.registerDomEvent(stage, "scroll", () => {
            if (this.frameAsked || this.disposed) return;
            this.frameAsked = true;
            nextFrame(this.el, () => {
                this.frameAsked = false;
                this.sync();
            });
        });
        // Ctrl/⌘ + wheel zooms (a trackpad's pinch arrives the same way); Across turns the wheel sideways.
        this.scope.registerDomEvent(
            stage,
            "wheel",
            (event: WheelEvent) => {
                if (!this.el.isConnected) return;
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    this.wheelZoom(event);
                    return;
                }
                if (this.host.layout() === "scroll" && this.across && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
                    event.preventDefault();
                    stage.scrollLeft = (stage.scrollLeft || 0) + event.deltaY * (event.deltaMode === 1 ? 16 : 1);
                }
            },
            { passive: false }
        );
        // Two fingers pinch (FR-2): the web view never zooms the app, the run follows them 1:1.
        this.scope.registerDomEvent(stage, "touchstart", (event: TouchEvent) => this.onTouch(event), { passive: false });
        this.scope.registerDomEvent(stage, "touchmove", (event: TouchEvent) => this.onTouch(event), { passive: false });
        this.scope.registerDomEvent(stage, "touchend", (event: TouchEvent) => this.onTouchEnd(event));
        this.scope.registerDomEvent(stage, "touchcancel", (event: TouchEvent) => this.onTouchEnd(event));
        // WebKit's own pinch on the page.
        this.scope.registerDomEvent(stage, "gesturestart" as keyof HTMLElementEventMap, (event: Event) => {
            if (this.el.isConnected) event.preventDefault();
        });
    }

    private onTouch(event: TouchEvent): void {
        const touches = event.touches;
        if (!this.el.isConnected || !touches || touches.length < 2) return;
        const a = touches[0];
        const b = touches[1];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const mid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
        if (event.cancelable) event.preventDefault();
        if (!this.pinch) {
            this.pinch = { d0: d, last: d, mid };
            return;
        }
        const pinch = this.pinch;
        if (Math.abs(d - pinch.d0) / Math.max(1, pinch.d0) > PINCH_SHARE) this.lastPinchAt = Date.now();
        // Until they spread or close, two fingers may be a swipe back (#761): nothing moves yet.
        if (!this.gesture && Date.now() - this.lastPinchAt > 50) return;
        const factor = d / Math.max(1, pinch.last);
        const pan = { x: mid.x - pinch.mid.x, y: mid.y - pinch.mid.y };
        pinch.last = d;
        pinch.mid = mid;
        this.zoomBy(factor, mid, pan);
    }

    private onTouchEnd(event: TouchEvent): void {
        if (!this.pinch || (event.touches && event.touches.length >= 2)) return;
        this.pinch = null;
        if (this.gesture) this.settle();
    }
}

/** Where a scroller is scrolled to (a fresh element may not say yet). */
function scrollOf(el: HTMLElement): { left: number; top: number } {
    return { left: el.scrollLeft || 0, top: el.scrollTop || 0 };
}

/** The next frame of the element's own window — a timer where there are no frames to wait for. */
function nextFrame(el: HTMLElement, run: () => void): void {
    const win = el.win ?? window;
    if (typeof win.requestAnimationFrame === "function") win.requestAnimationFrame(run);
    else win.setTimeout(run, 16);
}

/** A canvas let go: WebKit counts every canvas's memory until its size is 0. */
function release(canvas: HTMLCanvasElement): void {
    canvas.width = 0;
    canvas.height = 0;
    canvas.remove();
}
