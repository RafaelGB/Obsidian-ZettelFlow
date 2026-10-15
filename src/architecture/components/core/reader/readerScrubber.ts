import { c } from "architecture";
import type { HighlightMeaning } from "application/thinking/highlightMeaning";

/**
 * **The book at a glance** (#813): the bar's line, over the whole book. Where each chapter is, where
 * you marked something, your bookmarks and where you are — drawn from what the Reader already holds,
 * once per opening, never per frame (FR-2 – FR-8). This part is pure: the slider is drawn by the view.
 */

/** A chapter's place on the line: where it starts and ends, as shares of the whole book (0–1). */
export interface ScrubSpan {
    start: number;
    end: number;
}

/** Where you marked something, a chapter at a time: how much, quietly, and in which meaning most. */
export interface ScrubBand extends ScrubSpan {
    chapter: number;
    /** 0–1: how marked this chapter is beside the most marked one. Never a count. */
    density: number;
    meaning: HighlightMeaning;
}

export interface ScrubberModel {
    spans: ScrubSpan[];
    /** Where a chapter begins, past the first: none for a book counted only in pages (FR-3). */
    ticks: number[];
    bands: ScrubBand[];
    /** Your bookmarks, as places on the line. */
    bookmarks: number[];
}

/** What the model is made from: lengths, marks and bookmarks the Reader already has. */
export interface ScrubberInput {
    /** Each chapter's length — the zip's own sizes, words once drawn — or nothing: equal spans. */
    weights: readonly (number | undefined)[];
    /** The book is counted in pages, not chapters (a paper, a designed book): no ticks. */
    pages?: boolean;
    /** Your highlights in the layers shown, by chapter (FR-5): hidden layers are left out by the caller. */
    marks: readonly { at: number; meaning?: HighlightMeaning }[];
    bookmarks: readonly { chapter: number; share?: number }[];
}

/** A chapter weighs this much beside the book's average when it says nothing of its own length. */
const UNKNOWN_WEIGHT = 1;

/** The spans, frozen for the sitting: each chapter's share of the book by its weight (FR-2). */
export function scrubSpans(weights: readonly (number | undefined)[]): ScrubSpan[] {
    const known = weights.filter((w): w is number => typeof w === "number" && w > 0);
    const average = known.length > 0 ? known.reduce((a, b) => a + b, 0) / known.length : UNKNOWN_WEIGHT;
    const sized = weights.map((w) => (typeof w === "number" && w > 0 ? w : average));
    const total = sized.reduce((a, b) => a + b, 0) || 1;
    let at = 0;
    return sized.map((w) => {
        const span = { start: at / total, end: (at + w) / total };
        at += w;
        return span;
    });
}

/** The whole line (FR-2 – FR-8): spans, ticks, bands and bookmarks. Deterministic. */
export function scrubberModel(input: ScrubberInput): ScrubberModel {
    const spans = scrubSpans(input.weights);
    const ticks = input.pages ? [] : spans.slice(1).map((span) => span.start);
    const byChapter = new Map<number, Map<HighlightMeaning, number>>();
    for (const mark of input.marks) {
        if (!spans[mark.at]) continue;
        const counts = byChapter.get(mark.at) ?? new Map<HighlightMeaning, number>();
        const meaning = mark.meaning ?? "idea";
        counts.set(meaning, (counts.get(meaning) ?? 0) + 1);
        byChapter.set(mark.at, counts);
    }
    const totals = [...byChapter.values()].map((counts) => [...counts.values()].reduce((a, b) => a + b, 0));
    const most = Math.max(1, ...totals);
    const bands: ScrubBand[] = [...byChapter.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([chapter, counts]) => {
            const total = [...counts.values()].reduce((a, b) => a + b, 0);
            // The meaning used most in the chapter colours it; a tie goes to the first meaning.
            const meaning = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
            return { chapter, ...spans[chapter], density: Math.min(1, total / most), meaning };
        });
    const bookmarks = input.bookmarks
        .filter((mark) => spans[mark.chapter])
        .map((mark) => placeOf(spans, mark.chapter, mark.share ?? 0))
        .sort((a, b) => a - b);
    return { spans, ticks, bands, bookmarks };
}

/** The chapter a place on the line falls in (FR-10): the last one when past the end. */
export function stopAt(spans: readonly ScrubSpan[], share: number): number {
    if (spans.length === 0) return 0;
    const at = Math.min(Math.max(0, share), 1);
    const found = spans.findIndex((span) => at >= span.start && at < span.end);
    return found >= 0 ? found : spans.length - 1;
}

/** A place in a chapter (its share, 0–1) as a place on the line (FR-6). */
export function placeOf(spans: readonly ScrubSpan[], chapter: number, share = 0): number {
    const span = spans[Math.min(Math.max(0, chapter), spans.length - 1)];
    if (!span) return 0;
    return span.start + (span.end - span.start) * Math.min(Math.max(0, share), 1);
}

/** How much you marked in a chapter, said in words and never as a number (FR-7). */
export type MarksSaid = "none" | "one" | "some";

export function marksSaid(count: number): MarksSaid {
    return count <= 0 ? "none" : count === 1 ? "one" : "some";
}

/** What the slider asks of the Reader: where you are, what a chapter is called, how to go there. */
export interface ScrubberHooks {
    /** The chapter on screen, and how far into it (0–1). */
    current(): { index: number; share: number };
    /** A chapter's name, as the Reader says it. */
    label(index: number): string;
    /** How many marks a chapter holds — only ever said in words (FR-7). */
    marks(index: number): number;
    /** Travel there (FR-11): the Reader's own camera move, and a place on the trail. */
    go(index: number): void;
    /** Keep the bar up while the slider is in use (FR-14). */
    wake(): void;
}

/** The slider's words (FR-7, FR-17): its name, and the line under a chapter's name. */
export type ScrubberWords = Record<Exclude<MarksSaid, "none">, string> & { name: string };

let scrubberIds = 0;

/**
 * **The slider** (#813 FR-9 – FR-19): the bar's line over the whole book. Hover says where; a drag
 * previews and moves nothing until you let go; a release or a click travels; the keys step a chapter.
 * Built once per book with Obsidian's own element helpers; positions are custom properties only.
 */
export class ReaderScrubber {
    readonly el: HTMLElement;
    private readonly track: HTMLElement;
    private readonly fill: HTMLElement;
    private readonly thumb: HTMLElement;
    private readonly ghost: HTMLElement;
    private readonly tip: HTMLElement;
    private readonly layers: HTMLElement;
    private model: ScrubberModel = { spans: [], ticks: [], bands: [], bookmarks: [] };
    private dragging: { stop: number } | null = null;

    constructor(
        parent: HTMLElement,
        private readonly hooks: ScrubberHooks,
        private readonly words: ScrubberWords,
        register: (el: HTMLElement, type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "pointerleave", handler: (event: PointerEvent) => void) => void
    ) {
        // Named by a label of its own, not `aria-label`: Obsidian draws a tooltip for that, over ours.
        const named = `zf-scrubber-${++scrubberIds}`;
        this.el = parent.createDiv({
            cls: c("reader-scrubber"),
            attr: { role: "slider", tabindex: "0", "aria-labelledby": named, "aria-valuemin": "1", "aria-orientation": "horizontal" },
        });
        this.el.createSpan({ cls: c("visually-hidden"), text: words.name, attr: { id: named } });
        this.track = this.el.createDiv({ cls: c("reader-scrubber-track") });
        this.layers = this.track.createDiv({ cls: c("reader-scrubber-layers"), attr: { "aria-hidden": "true" } });
        this.fill = this.track.createDiv({ cls: c("reader-scrubber-fill"), attr: { "aria-hidden": "true" } });
        this.ghost = this.track.createDiv({ cls: [c("reader-scrubber-ghost"), c("reader-hidden")], attr: { "aria-hidden": "true" } });
        this.thumb = this.track.createDiv({ cls: c("reader-scrubber-thumb"), attr: { "aria-hidden": "true" } });
        this.tip = this.el.createDiv({ cls: [c("reader-scrubber-tip"), c("reader-hidden")], attr: { "aria-hidden": "true" } });
        register(this.el, "pointerdown", (event) => this.down(event));
        register(this.el, "pointermove", (event) => this.move(event));
        register(this.el, "pointerup", (event) => this.up(event));
        register(this.el, "pointercancel", () => this.cancel());
        register(this.el, "pointerleave", () => {
            if (!this.dragging) this.hideTip();
        });
    }

    /** The book's line (FR-2 – FR-6), drawn again only when what it shows changed. */
    setModel(model: ScrubberModel): void {
        this.model = model;
        this.layers.empty();
        for (const tick of model.ticks) this.at(this.layers.createDiv({ cls: c("reader-scrubber-tick") }), tick);
        for (const band of model.bands) {
            const el = this.layers.createDiv({ cls: [c("reader-scrubber-band"), c(`reader-scrubber-band--${band.meaning}`)] });
            el.setCssProps({ "--zf-at": String(band.start), "--zf-span": String(Math.max(0, band.end - band.start)), "--zf-density": String(band.density) });
        }
        for (const mark of model.bookmarks) this.at(this.layers.createDiv({ cls: c("reader-scrubber-bookmark") }), mark);
        this.el.setAttribute("aria-valuemax", String(Math.max(1, model.spans.length)));
        this.update();
    }

    /** Where you are (FR-6), and what a screen reader hears (FR-17). */
    update(): void {
        const { index, share } = this.hooks.current();
        const at = placeOf(this.model.spans, index, share);
        this.fill.setCssProps({ "--zf-at": String(at) });
        this.at(this.thumb, at);
        this.el.setAttribute("aria-valuenow", String(index + 1));
        this.el.setAttribute("aria-valuetext", this.hooks.label(index));
    }

    /** Whether an event's target is the slider's own. */
    contains(target: EventTarget | null): boolean {
        return Boolean(target) && this.el.contains(target as Node);
    }

    /** The slider's keys (FR-18): a chapter at a time, and the ends — never a page turn. */
    key(key: string): boolean {
        if (this.dragging && key === "Escape") {
            this.cancel();
            return true;
        }
        const { index } = this.hooks.current();
        const last = this.model.spans.length - 1;
        const to = key === "ArrowRight" || key === "ArrowUp" ? index + 1 : key === "ArrowLeft" || key === "ArrowDown" ? index - 1 : key === "Home" ? 0 : key === "End" ? last : null;
        if (to === null || last < 0) return false;
        const target = Math.min(Math.max(0, to), last);
        if (target !== index) this.hooks.go(target);
        return true;
    }

    /** A drag under way (FR-10): Esc takes it back. */
    isDragging(): boolean {
        return this.dragging !== null;
    }

    private at(el: HTMLElement, share: number): void {
        el.setCssProps({ "--zf-at": String(Math.min(Math.max(0, share), 1)) });
    }

    private shareAt(event: PointerEvent): number {
        const box = this.track.getBoundingClientRect();
        return box.width > 0 ? (event.clientX - box.left) / box.width : 0;
    }

    private showTip(stop: number): void {
        const span = this.model.spans[stop];
        if (!span) return;
        this.tip.empty();
        this.tip.createDiv({ cls: c("reader-scrubber-tip-name"), text: this.hooks.label(stop) });
        const said = marksSaid(this.hooks.marks(stop));
        if (said !== "none") this.tip.createDiv({ cls: c("reader-scrubber-tip-marks"), text: this.words[said] });
        this.tip.setCssProps({ "--zf-at": String((span.start + span.end) / 2) });
        this.tip.removeClass(c("reader-hidden"));
    }

    private hideTip(): void {
        this.tip.addClass(c("reader-hidden"));
    }

    private down(event: PointerEvent): void {
        if (typeof event.button === "number" && event.button !== 0) return;
        event.preventDefault?.();
        event.stopPropagation?.();
        this.el.setPointerCapture?.(event.pointerId);
        const stop = stopAt(this.model.spans, this.shareAt(event));
        this.dragging = { stop };
        this.el.addClass(c("reader-scrubber--dragging"));
        this.preview(stop);
        this.hooks.wake();
    }

    private move(event: PointerEvent): void {
        this.hooks.wake();
        const stop = stopAt(this.model.spans, this.shareAt(event));
        if (this.dragging) {
            if (stop === this.dragging.stop) return;
            this.dragging.stop = stop;
            this.preview(stop);
            return;
        }
        // Hover (FR-9): the chapter under the pointer, said.
        this.showTip(stop);
    }

    private up(event: PointerEvent): void {
        const drag = this.dragging;
        if (!drag) return;
        event.stopPropagation?.();
        this.end();
        // Let go in the chapter you are in, and nothing moves (FR-12).
        if (drag.stop !== this.hooks.current().index) this.hooks.go(drag.stop);
    }

    private preview(stop: number): void {
        const span = this.model.spans[stop];
        if (span) this.at(this.ghost, span.start);
        this.ghost.removeClass(c("reader-hidden"));
        this.showTip(stop);
    }

    private cancel(): void {
        if (this.dragging) this.end();
    }

    private end(): void {
        this.dragging = null;
        this.el.removeClass(c("reader-scrubber--dragging"));
        this.ghost.addClass(c("reader-hidden"));
        this.hideTip();
    }
}
