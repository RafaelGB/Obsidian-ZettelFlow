import { Component, Platform, setIcon, type App } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { anchorAll, type TextSpan } from "application/thinking/quoteAnchor";
import { isInk, isPageInk, type Thought, type ThoughtInk, type ThoughtLocator, type ThoughtQuote } from "application/thinking/thought";
import { appendPoint, distanceToSegment, mergedPaths, newStroke, segmentPath, segmentsOf, type InkPoint, type LiveStroke, type Segment } from "application/reader/ink/inkStroke";
import { drawingBox, INK_COLOURS, isUnreadable, parseInkSvg, renderInkSvg, type InkColour, type InkDrawing, type InkStrokeData } from "application/reader/ink/inkSvg";
import { anchorInk, keepOnPage, pageAnchor, placeInk, PAGE_EMS, type Box, type Column, type InkAnchor, type WordBox } from "application/reader/ink/inkAnchor";
import { GROUP_IDLE_MS, InkGrouping, type FlushReason, type InkBox, type InkGroup } from "application/reader/ink/inkGroup";
import { altitudeOf, routePointer, twoFingerTap, PALM_WINDOW_MS, type FingerTrace } from "application/reader/ink/inkInput";
import { chapterText, pointAt, textNodes } from "./readerMarks";
import { MOTION, motionWelcome } from "./readerMotion";
import { renderInkThumb } from "./readerInkThumb";

type LocaleKey = Parameters<typeof t>[0];

/** Whether the palette was open, on this device only — never synced (FR-1). */
export const INK_STORAGE_KEY = "zettelflow-reader-ink";
/** How close the eraser must pass to a stroke to take it, in px on screen (FR-7). */
export const ERASER_RADIUS_PX = 10;
/** How long a quiet line in the palette stays. */
const STATUS_MS = 6000;
const INK_TOOLS = ["pen", "eraser"] as const;
type InkTool = (typeof INK_TOOLS)[number];

/** The colour names, as the palette says them. A literal map, so the locale guardrail sees each key. */
const COLOUR_LABEL: Record<InkColour, LocaleKey> = {
    pencil: "reader_ink_colour_pencil",
    red: "reader_ink_colour_red",
    blue: "reader_ink_colour_blue",
    green: "reader_ink_colour_green",
};
const TOOL_LABEL: Record<InkTool, LocaleKey> = { pen: "reader_ink_pen", eraser: "reader_ink_eraser" };
const TOOL_ICON: Record<InkTool, string> = { pen: "pen-line", eraser: "eraser" };

/** Where ink is kept — the thought store, as far as the Reader's ink uses it (#745 E7). */
export interface InkStore {
    folder(): string;
    highlightsAbout(notePath: string): Promise<Thought[]>;
    writeInk(
        input: { text?: string; about: string; quote?: ThoughtQuote; locator?: ThoughtLocator; ink: { side: InkAnchor["side"]; x: number; line: number; em: number } | { page: { px: number; py: number; pw: number; ph: number } }; layer?: string },
        svg: string
    ): Promise<Thought | undefined>;
    drawingOf(thought: Thought): Promise<string | undefined>;
    saveDrawing(thought: Thought, svg: string): Promise<void>;
    discard(thought: Thought): Promise<string | undefined | void>;
    restore(thought: Thought, drawing?: string): Promise<void>;
}

/** The parts of the view ink draws into and acts through. */
export interface InkView {
    app: App;
    /** Where the palette floats: the reader's root. */
    root: HTMLElement;
    stage(): HTMLElement | null;
    /** What lives as long as the reader does. */
    owner: Component;
    /** The margin's list changed. */
    refreshList(): void;
}

/** Seams for tests; the defaults are the real DOM, the real store and the real clock. */
export interface InkDeps {
    store?: InkStore;
    /** The words near `y` (client px) in `body`, in client coordinates, and the chapter's text. */
    words?: (body: HTMLElement, y: number, linePx: number) => { words: WordBox[]; text: string };
    /** Where a span of the chapter's text is on screen, in client coordinates. */
    spanBox?: (body: HTMLElement, span: TextSpan) => Box | null;
    /** The reading type: its size and its line, in px. */
    metrics?: (body: HTMLElement) => { fontPx: number; linePx: number };
    /** The chapter's text, as highlights count it. */
    text?: (body: HTMLElement) => string;
    now?: () => number;
}

/** The chapter on screen, as ink needs it. */
export interface InkChapter {
    body: HTMLElement;
    page: HTMLElement;
    notePath: string;
    locator: ThoughtLocator | null;
    component: Component;
    /** A paper in Page view: ink goes on its printed pages (`decorateSlot`), never over the text. */
    run: boolean;
}

/** One place a stroke is drawn on: the chapter's page (px), or a printed page (ems of `PAGE_EMS`). */
interface Surface {
    key: string;
    svg: SVGSVGElement;
    /** From the screen to the surface's own units. */
    local(x: number, y: number): [number, number];
    /** Surface units per em of ink width (and of reach, for grouping). */
    unit: number;
    page?: { index: number; aspect: number };
}

/** A stroke written in this session, not yet in a kept note. Points are in its surface's units. */
interface LiveInk {
    colour: InkColour;
    pointerType: string;
    stroke: LiveStroke;
    el: SVGGElement;
    provisional: SVGPathElement | null;
    surface: Surface;
    box: InkBox;
    startedAt: number;
    /** Once written: the kept note it went into. */
    note?: KeptNote;
}

interface KeptStroke {
    data: InkStrokeData;
    el: SVGGElement;
    from?: LiveInk;
}

/** An ink note on screen: written, being written, or — when the write failed — waiting to be. */
interface KeptNote {
    thought: Thought | null;
    strokes: KeptStroke[];
    el: SVGGElement;
    state: "saving" | "kept" | "unsaved";
    surface: "text" | number;
    /** Text ink: its anchor and the span it is anchored to now. */
    anchor?: InkAnchor;
    span?: TextSpan | null;
    /** Page ink: its origin on the page, in ems. */
    origin?: [number, number];
    /** Text ink: where it is on the page now, and its px per em. */
    placed?: { left: number; top: number; unit: number };
    /** What a failed write was asked to keep, for the next try. */
    retry?: { input: Parameters<InkStore["writeInk"]>[0] };
    /** The write in flight, so an undo waits for it rather than racing it. */
    saving?: Promise<void>;
}

/** An entry in the margin's list: an ink note not drawn here, with why (FR-12). */
interface ListedInk {
    thought: Thought;
    drawing: InkDrawing | null;
    reason: LocaleKey | null;
}

/** One step the palette's undo takes back (#745 E8); #746 and #747 push their own. */
export interface InkAction {
    undo(): Promise<void> | void;
    redo?(): Promise<void> | void;
}

function ownWindow(el: HTMLElement): Window {
    return (el as HTMLElement & { win?: Window }).win ?? window;
}

const px = (n: number) => `${Math.round(n * 100) / 100}px`;

/** The reading type of the chapter, as the browser lays it out. */
function readMetrics(body: HTMLElement): { fontPx: number; linePx: number } {
    const style = ownWindow(body).getComputedStyle?.(body) as CSSStyleDeclaration | undefined;
    const fontPx = Number.parseFloat(style?.fontSize ?? "") || 16;
    const line = Number.parseFloat(style?.lineHeight ?? "");
    return { fontPx, linePx: Number.isFinite(line) && line > 0 ? line : fontPx * 1.75 };
}

/** The words of the chapter within a few lines of `y`, measured once — what a flush anchors to. */
function readWords(body: HTMLElement, y: number, linePx: number): { words: WordBox[]; text: string } {
    const doc = body.ownerDocument;
    const words: WordBox[] = [];
    let pos = 0;
    const reach = linePx * 4;
    for (const node of textNodes(body) as unknown as Text[]) {
        const length = node.data.length;
        const parent = node.parentElement;
        const near = parent?.getBoundingClientRect();
        if (doc && near && near.bottom >= y - reach && near.top <= y + reach) {
            const range = doc.createRange();
            for (const match of node.data.matchAll(/\S+/g)) {
                const at = match.index ?? 0;
                range.setStart(node, at);
                range.setEnd(node, at + match[0].length);
                const rect = range.getBoundingClientRect();
                if (rect.width > 0 || rect.height > 0) words.push({ start: pos + at, end: pos + at + match[0].length, left: rect.left, top: rect.top, width: rect.width, height: rect.height });
            }
        }
        pos += length;
    }
    return { words, text: chapterText(body) };
}

/** Where a span of the chapter is on screen: its first line's box. */
function readSpanBox(body: HTMLElement, span: TextSpan): Box | null {
    const doc = body.ownerDocument;
    const start = pointAt(body, span.start);
    const end = pointAt(body, Math.max(span.start, span.end - 1));
    if (!doc || !start || !end) return null;
    const range = doc.createRange();
    range.setStart(start.node as unknown as Node, start.offset);
    range.setEnd(end.node as unknown as Node, Math.min(end.node.data.length, end.offset + 1));
    const rect = range.getClientRects?.()[0] ?? range.getBoundingClientRect();
    return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
}

/**
 * **Ink in the margin** (#745, epic #740): the palette, the ink layer and where ink lives.
 *
 * With the palette open a pen (or a mouse) writes on the page; a finger keeps scrolling and turning,
 * and a hand resting on the glass while you write does nothing. Strokes written together are one ink
 * note, kept when it goes idle, when the page turns and when the Reader closes, as a thought in the
 * thinking space with its drawing — an SVG — beside it. It is anchored to the words it was written
 * beside, so it follows them through any size, column and re-flow. The book is never written.
 *
 * The nib leads (FR-18): a move is drawn in the next frame of the stage's own window, the newest
 * piece always ending on the nib, and nothing animates while you write.
 */
export class ReaderInk {
    private readonly store: InkStore;
    private readonly words: NonNullable<InkDeps["words"]>;
    private readonly spanBox: NonNullable<InkDeps["spanBox"]>;
    private readonly metrics: NonNullable<InkDeps["metrics"]>;
    private readonly text: NonNullable<InkDeps["text"]>;
    private readonly now: () => number;

    private open = false;
    private tool: InkTool = "pen";
    private colour: InkColour = "pencil";
    private button: HTMLElement | null = null;
    private palette: HTMLElement | null = null;
    private statusEl: HTMLElement | null = null;
    private statusTimer: number | undefined;
    /** The listeners that live only while the palette is open (the stylus and palm guards). */
    private openScope: Component | null = null;

    private chapter: InkChapter | null = null;
    private layer: SVGSVGElement | null = null;
    private generation = 0;
    private readonly grouping = new InkGrouping<LiveInk>();
    private idleTimer: number | undefined;
    private live: LiveInk | null = null;
    private livePointer: number | null = null;
    private queued: InkPoint[] = [];
    private frameAsked = false;
    private erasing: { pointer: number; surface: Surface; hits: Set<LiveInk | KeptStroke>; last: [number, number] | null } | null = null;
    private rejected = new Set<number>();
    private penDown = false;
    private lastPenUpAt: number | null = null;
    private fingers = new Map<number, FingerTrace & { live: boolean }>();
    private readonly undoStack: InkAction[] = [];
    /** The ink notes drawn on this chapter, and the ones waiting for a write to succeed. */
    private notes: KeptNote[] = [];
    /** A paper's page ink: it lives on its printed pages, which outlive the chapter's redraws. */
    private runNotes: KeptNote[] = [];
    private listed: ListedInk[] = [];
    /** A paper in Page view: its ink, read once per paper, drawn on each printed page as it appears. */
    private runInk: { path: string; thoughts: Thought[]; drawings: Map<string, InkDrawing | null> } | null = null;
    private slots = new Map<number, { el: HTMLElement; svg: SVGSVGElement; aspect: number }>();

    constructor(
        private readonly view: InkView,
        deps: InkDeps = {}
    ) {
        this.store = deps.store ?? (ThoughtStore.getInstance());
        this.words = deps.words ?? readWords;
        this.spanBox = deps.spanBox ?? readSpanBox;
        this.metrics = deps.metrics ?? readMetrics;
        this.text = deps.text ?? ((body) => chapterText(body));
        this.now = deps.now ?? (() => Date.now());
        this.buildPalette();
        // An iPad used for ink stays ready for ink (FR-1).
        if (this.view.app?.loadLocalStorage?.(INK_STORAGE_KEY) === "open") this.openPalette(false);
    }

    // ── the palette ──────────────────────────────────────────────────────────

    /** The pencil in the reader bar (the door, rank 1). */
    mountButton(bar: HTMLElement): HTMLElement {
        const button = bar.createEl("button", {
            cls: ["clickable-icon", c("reader-bar-button"), c("reader-ink-button")],
            attr: { type: "button", "aria-label": t("reader_ink"), "aria-pressed": String(this.open) },
        });
        setIcon(button, "pencil");
        this.view.owner.registerDomEvent(button, "click", () => this.togglePalette());
        this.button = button;
        this.syncButton();
        return button;
    }

    isOpen(): boolean {
        return this.open;
    }

    togglePalette(): void {
        if (this.open) this.closePalette();
        else this.openPalette();
    }

    openPalette(remember = true): void {
        if (this.open) return;
        this.open = true;
        if (remember) this.view.app?.saveLocalStorage?.(INK_STORAGE_KEY, "open");
        this.palette?.addClass("is-open");
        this.palette?.setAttribute("aria-hidden", "false");
        this.syncButton();
        this.syncStage();
        this.guardTouches();
        // No thinking space: the palette says where ink is kept, and nothing draws (FR-15).
        if (!this.store.folder()) this.status("reader_ink_no_lab", undefined, true);
        else this.clearStatus();
    }

    closePalette(remember = true): void {
        if (!this.open) return;
        this.open = false;
        if (remember) this.view.app?.saveLocalStorage?.(INK_STORAGE_KEY, "closed");
        this.endStroke(null);
        this.palette?.removeClass("is-open");
        this.palette?.setAttribute("aria-hidden", "true");
        this.syncButton();
        this.syncStage();
        this.openScope?.unload();
        this.openScope = null;
        this.clearStatus();
    }

    private buildPalette(): void {
        const root = this.view.root;
        const palette = root.createDiv({ cls: c("reader-ink-palette"), attr: { role: "toolbar", "aria-label": t("reader_ink_palette"), "aria-hidden": "true" } });
        const tools = palette.createDiv({ cls: c("reader-ink-tools") });
        tools.createSpan({ cls: c("reader-ink-marker"), attr: { "aria-hidden": "true" } });
        for (const tool of INK_TOOLS) {
            const button = tools.createEl("button", {
                cls: ["clickable-icon", c("reader-ink-tool"), ...(tool === this.tool ? ["is-active"] : [])],
                attr: { type: "button", "aria-label": t(TOOL_LABEL[tool]), "aria-pressed": String(tool === this.tool), "data-tool": tool },
            });
            setIcon(button, TOOL_ICON[tool]);
            this.view.owner.registerDomEvent(button, "click", () => this.chooseTool(tool));
        }
        const colours = palette.createDiv({ cls: c("reader-ink-colours") });
        for (const colour of INK_COLOURS) {
            const button = colours.createEl("button", {
                cls: ["clickable-icon", c("reader-ink-colour"), ...(colour === this.colour ? ["is-active"] : [])],
                attr: { type: "button", "aria-label": t(COLOUR_LABEL[colour]), "aria-pressed": String(colour === this.colour), "data-colour": colour },
            });
            button.createSpan({ cls: [c("reader-ink-swatch"), c(`reader-ink--${colour}`)] });
            this.view.owner.registerDomEvent(button, "click", () => this.chooseColour(colour));
        }
        const undo = palette.createEl("button", { cls: ["clickable-icon", c("reader-ink-undo")], attr: { type: "button", "aria-label": t("reader_ink_undo") } });
        setIcon(undo, "undo-2");
        this.view.owner.registerDomEvent(undo, "click", () => void this.undo());
        this.statusEl = palette.createDiv({ cls: c("reader-ink-status"), attr: { role: "status" } });
        this.palette = palette;
        this.placeMarker();
    }

    private chooseTool(tool: InkTool): void {
        this.tool = tool;
        this.palette?.querySelectorAll<HTMLElement>(`.${c("reader-ink-tool")}`).forEach((button) => {
            const on = button.getAttribute("data-tool") === tool;
            button.toggleClass("is-active", on);
            button.setAttribute("aria-pressed", String(on));
        });
        this.placeMarker();
        this.syncStage();
    }

    private chooseColour(colour: InkColour): void {
        this.colour = colour;
        this.palette?.querySelectorAll<HTMLElement>(`.${c("reader-ink-colour")}`).forEach((button) => {
            const on = button.getAttribute("data-colour") === colour;
            button.toggleClass("is-active", on);
            button.setAttribute("aria-pressed", String(on));
        });
        // A colour is for writing: choosing one takes the pen back up.
        if (this.tool !== "pen") this.chooseTool("pen");
    }

    /** The active tool's marker glides to it (FR-20): transform only, read from one custom property. */
    private placeMarker(): void {
        this.palette?.setCssProps({ "--zf-ink-marker": String(INK_TOOLS.indexOf(this.tool)) });
    }

    private syncButton(): void {
        this.button?.toggleClass("is-active", this.open);
        this.button?.setAttribute("aria-pressed", String(this.open));
    }

    /** The page takes ink while the palette is open: no text selection, and the pen's own pointer. */
    private syncStage(): void {
        const stage = this.view.stage();
        stage?.toggleClass(c("reader-stage--inking"), this.open);
        stage?.toggleClass(c("reader-stage--erasing"), this.open && this.tool === "eraser");
        // Desktop Chromium pans a pen under `touch-action: pan-y`; there a finger scrolls with the wheel.
        stage?.toggleClass(c("reader-stage--ink-desktop"), this.open && !Platform.isMobile);
    }

    /**
     * WebKit scrolls under a Pencil with `touch-action: pan-y` (Risk 1). While the palette is open, a
     * stylus touch is never a scroll, and neither is a palm while the pen is down or just lifted (FR-3)
     * — a finger still scrolls natively. Non-passive, and only while the palette is open.
     */
    private guardTouches(): void {
        const stage = this.view.stage();
        if (!stage || this.openScope) return;
        const scope = new Component();
        scope.load();
        this.openScope = scope;
        const guard = (event: TouchEvent) => {
            if (!event.cancelable) return;
            const stylus = Array.from(event.changedTouches ?? []).some((touch) => "touchType" in touch && (touch as Touch & { touchType?: string }).touchType === "stylus");
            if (stylus || this.palmWindow()) event.preventDefault();
        };
        scope.registerDomEvent(stage, "touchstart", guard, { passive: false });
        scope.registerDomEvent(stage, "touchmove", guard, { passive: false });
    }

    private palmWindow(): boolean {
        if (this.penDown) return true;
        return this.lastPenUpAt !== null && this.now() - this.lastPenUpAt <= PALM_WINDOW_MS;
    }

    // ── status: one quiet line in the palette, never a toast over the page ───

    private status(key: LocaleKey, undo?: () => void, sticky = false): void {
        const el = this.statusEl;
        if (!el) return;
        ownWindow(el).clearTimeout(this.statusTimer);
        el.empty();
        el.createSpan({ cls: c("reader-ink-status-text"), text: t(key) });
        if (undo) {
            const button = el.createEl("button", { cls: c("reader-ink-status-undo"), text: t("reader_hl_undo"), attr: { type: "button" } });
            this.view.owner.registerDomEvent(button, "click", () => {
                button.setAttribute("disabled", "true");
                undo();
                this.clearStatus();
            });
        }
        el.addClass("is-shown");
        if (!sticky) this.statusTimer = ownWindow(el).setTimeout(() => this.clearStatus(), STATUS_MS);
    }

    private clearStatus(): void {
        const el = this.statusEl;
        if (!el) return;
        ownWindow(el).clearTimeout(this.statusTimer);
        el.removeClass("is-shown");
        el.empty();
    }

    // ── chapters ─────────────────────────────────────────────────────────────

    /**
     * A chapter is about to go (a turn, a jump, the Reader closing): the open note is written first,
     * with the page it was written on still there to anchor it (FR-9).
     */
    leave(reason: FlushReason): void {
        this.endStroke(null);
        void this.flush(reason);
        this.generation++;
        this.chapter = null;
        this.layer = null;
        this.notes = [];
        this.listed = [];
        // Undo is the chapter's: it never reaches ink that is no longer on screen.
        this.undoStack.length = 0;
    }

    private allNotes(): KeptNote[] {
        return [...this.notes, ...this.runNotes];
    }

    /** Take over a freshly drawn chapter: its ink layer, inside the page so a turn carries it (FR-22). */
    attach(chapter: InkChapter): void {
        this.generation++;
        this.chapter = chapter;
        this.notes = [];
        this.listed = [];
        this.layer = null;
        if (!chapter.run) {
            const layer = chapter.page.createSvg("svg", { cls: [c("reader-ink-layer")], attr: { "aria-hidden": "true" } });
            this.layer = layer;
            return;
        }
        // A paper in Page view: its ink is read once per paper and drawn on each page as it appears.
        if (this.runInk?.path !== chapter.notePath) {
            this.runInk = { path: chapter.notePath, thoughts: [], drawings: new Map() };
            this.runNotes = [];
            this.slots.clear();
            void this.loadRunInk(chapter.notePath);
        }
    }

    /** The chapter's ink notes, from the margin's one read of the thoughts (#745 E9). */
    onInk(thoughts: readonly Thought[]): void {
        const chapter = this.chapter;
        if (!chapter) return;
        const generation = this.generation;
        void this.showInk(chapter, thoughts.filter(isInk), generation);
    }

    private async showInk(chapter: InkChapter, thoughts: Thought[], generation: number): Promise<void> {
        const listed: ListedInk[] = [];
        const placeable: { thought: Thought; drawing: InkDrawing; quote: ThoughtQuote }[] = [];
        for (const thought of thoughts) {
            const ink = thought.ink as ThoughtInk;
            let drawing: InkDrawing | null = null;
            let readable = true;
            try {
                const text = await this.store.drawingOf(thought);
                const parsed = text === undefined ? null : parseInkSvg(text);
                if (parsed && !isUnreadable(parsed)) drawing = parsed;
                else readable = false;
            } catch (error) {
                log.warn(`[Reader] could not read an ink drawing: ${String(error)}`);
                readable = false;
            }
            if (generation !== this.generation) return;
            if (!readable || !drawing) listed.push({ thought, drawing: null, reason: "reader_ink_unreadable" });
            else if (chapter.run) listed.push({ thought, drawing, reason: isPageInk(ink) ? null : "reader_ink_reading_view" });
            else if (isPageInk(ink)) listed.push({ thought, drawing, reason: "reader_ink_page_view" });
            else if (!thought.quote?.exact) listed.push({ thought, drawing, reason: "reader_ink_detached" });
            else placeable.push({ thought, drawing, quote: thought.quote });
        }
        if (generation !== this.generation) return;
        const { anchored, detached } = anchorAll(this.text(chapter.body), placeable);
        for (const entry of anchored) {
            const ink = entry.thought.ink as Extract<ThoughtInk, { side: unknown }>;
            const note = this.drawNote(entry.thought, entry.drawing, { quote: entry.quote, side: ink.side, x: ink.x, line: ink.line, em: ink.em }, entry.span, "kept");
            if (note) this.notes.push(note);
        }
        for (const entry of detached) listed.push({ thought: entry.thought, drawing: entry.drawing, reason: "reader_ink_detached" });
        // Every written note is in the list: the ones drawn here first, then the ones that cannot be.
        this.listed = [...anchored.map((entry) => ({ thought: entry.thought, drawing: entry.drawing, reason: null })), ...listed];
        this.layout();
        this.view.refreshList();
    }

    /** Ink of a paper in Page view, read once. */
    private async loadRunInk(path: string): Promise<void> {
        let thoughts: Thought[] = [];
        try {
            thoughts = (await this.store.highlightsAbout(path)).filter((thought) => thought.ink && isPageInk(thought.ink));
        } catch (error) {
            log.warn(`[Reader] could not read the ink of ${path}: ${String(error)}`);
        }
        const run = this.runInk;
        if (!run || run.path !== path) return;
        run.thoughts = thoughts;
        for (const thought of thoughts) {
            try {
                const text = await this.store.drawingOf(thought);
                const parsed = text === undefined ? null : parseInkSvg(text);
                run.drawings.set(thought.id, parsed && !isUnreadable(parsed) ? parsed : null);
            } catch {
                run.drawings.set(thought.id, null);
            }
        }
        if (this.runInk !== run) return;
        for (const [index, slot] of this.slots) this.drawPageInk(index, slot.svg, slot.aspect);
    }

    /**
     * A printed page of a paper in Page view appeared (#767's run makes and lets go of them as you
     * scroll): it gets its own ink surface, in ems of its width — so a zoom scales the ink with it.
     */
    decorateSlot(index: number, el: HTMLElement, shape = 0): void {
        const box = shape > 0 ? null : el.getBoundingClientRect();
        const aspect = shape > 0 ? shape : box && box.width > 0 && box.height > 0 ? box.height / box.width : 1.414;
        const svg = el.createSvg("svg", {
            // A printed page is paper whatever the theme: its ink takes the light palette's colours.
            cls: [c("reader-ink-page"), "theme-light"],
            attr: { viewBox: `0 0 ${PAGE_EMS} ${round3(PAGE_EMS * aspect)}`, "aria-hidden": "true", "data-page": String(index) },
        });
        this.slots.set(index, { el, svg, aspect });
        // A page made again (scrolled away and back) is a fresh surface: its ink is drawn anew.
        this.runNotes = this.runNotes.filter((note) => note.surface !== index);
        this.drawPageInk(index, svg, aspect);
    }

    private drawPageInk(index: number, svg: SVGSVGElement, aspect: number): void {
        const run = this.runInk;
        if (!run) return;
        for (const thought of run.thoughts) {
            const ink = thought.ink;
            const drawing = run.drawings.get(thought.id);
            if (!ink || !isPageInk(ink) || !drawing || thought.locator?.at !== index) continue;
            if (this.runNotes.some((note) => note.thought?.id === thought.id && note.surface === index)) continue;
            const origin: [number, number] = [ink.page.px * PAGE_EMS, ink.page.py * PAGE_EMS * aspect];
            const note = this.makeNoteEl(svg, thought, drawing, "kept");
            note.surface = index;
            note.origin = origin;
            note.el.setAttribute("transform", `translate(${round3(origin[0])} ${round3(origin[1])})`);
            this.runNotes.push(note);
        }
    }

    // ── the pointer ──────────────────────────────────────────────────────────

    /**
     * Asked by the page before its own touch handling starts a gesture (R1's contract): whether this
     * pointer is ink's — a pen or a mouse with the palette open, or a palm. A finger is never ink's;
     * ink only watches it for the two-finger tap.
     */
    claims(event: PointerEvent): boolean {
        const type = event.pointerType || "mouse";
        if (type === "touch") this.watchFinger(event);
        const route = routePointer({ type, paletteOpen: this.open, labSet: Boolean(this.store.folder()), penDown: this.penDown, lastPenUpAt: this.lastPenUpAt, now: this.now() });
        if (route === "pass") return false;
        if (route === "reject") {
            this.rejected.add(event.pointerId);
            this.fingers.delete(event.pointerId);
            return true;
        }
        if (event.button !== undefined && event.button > 0) return false;
        event.preventDefault?.();
        if (route === "explain") {
            this.status("reader_ink_no_lab", undefined, true);
            this.palette?.addClass(c("reader-ink-palette--explain"));
            ownWindow(this.view.root).setTimeout(() => this.palette?.removeClass(c("reader-ink-palette--explain")), MOTION.base);
            this.rejected.add(event.pointerId);
            return true;
        }
        const surface = this.surfaceAt(event);
        if (!surface) return false;
        this.capture(event);
        this.penDown = type === "pen";
        if (this.tool === "eraser") {
            this.erasing = { pointer: event.pointerId, surface, hits: new Set(), last: null };
            this.eraseAt(event);
            return true;
        }
        this.beginStroke(event, surface);
        return true;
    }

    /** A move of a pointer ink has claimed. */
    move(event: PointerEvent): boolean {
        if (event.pointerType === "touch") this.trackFinger(event);
        if (this.rejected.has(event.pointerId)) return true;
        if (this.erasing && this.erasing.pointer === event.pointerId) {
            for (const sample of this.samples(event)) this.eraseAt(sample);
            return true;
        }
        const live = this.live;
        if (!live || this.livePointer !== event.pointerId) return false;
        // A mouse that moves with no button down lifted somewhere we never heard: the stroke ends there.
        if (event.pointerType === "mouse" && event.buttons === 0) {
            this.endStroke(event);
            return true;
        }
        for (const sample of this.samples(event)) this.queued.push(this.pointOf(sample, live));
        this.askFrame();
        return true;
    }

    /** The pointer lifted. */
    up(event: PointerEvent): boolean {
        if (event.pointerType === "touch") this.liftFinger(event);
        if (this.rejected.delete(event.pointerId)) return true;
        if (this.erasing && this.erasing.pointer === event.pointerId) {
            this.eraseAt(event);
            this.finishErase();
            this.penUpNow(event);
            return true;
        }
        const live = this.live;
        if (!live || this.livePointer !== event.pointerId) return false;
        this.queued.push(this.pointOf(event, live));
        this.endStroke(event);
        return true;
    }

    /** The system took the pointer (a gesture of its own): the stroke is dropped, nothing is kept. */
    cancel(event: PointerEvent): void {
        this.fingers.delete(event?.pointerId);
        this.rejected.delete(event?.pointerId);
        if (this.erasing?.pointer === event?.pointerId) {
            for (const hit of this.erasing.hits) hit.el.removeClass(c("reader-ink--erasing"));
            this.erasing = null;
        }
        if (this.live && this.livePointer === event?.pointerId) {
            this.live.el.remove();
            this.live = null;
            this.livePointer = null;
            this.queued = [];
            this.grouping.cancel();
        }
        this.penDown = false;
    }

    private capture(event: PointerEvent): void {
        const stage = this.view.stage();
        try {
            stage?.setPointerCapture?.(event.pointerId);
        } catch {
            // A pointer already gone cannot be captured; the stroke still draws from the stage's events.
        }
    }

    /** The samples a move carries: the coalesced ones where the platform gives them (desktop Chromium). */
    private samples(event: PointerEvent): PointerEvent[] {
        const coalesced = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
        return coalesced.length > 0 ? coalesced : [event];
    }

    private pointOf(event: PointerEvent, live: LiveInk): InkPoint {
        const [x, y] = live.surface.local(event.clientX, event.clientY);
        return { x, y, p: typeof event.pressure === "number" ? event.pressure : 0.5, tilt: altitudeOf(event), t: Math.max(0, (event.timeStamp ?? 0) - live.startedAt) };
    }

    /** Where a pointer writes: on a printed page under it in Page view, else on the chapter's page. */
    private surfaceAt(event: PointerEvent): Surface | null {
        const chapter = this.chapter;
        if (!chapter) return null;
        if (chapter.run) {
            const target = event.target as HTMLElement | null;
            const slot = target?.closest?.(`.${c("reader-pv-slot")}`) as HTMLElement | null;
            const index = Number(slot?.getAttribute("data-page"));
            const entry = Number.isInteger(index) ? this.slots.get(index) : undefined;
            if (!slot || !entry) return null;
            const box = this.pageRect(entry);
            const scale = PAGE_EMS / Math.max(1, box.width);
            return { key: `page:${index}`, svg: entry.svg, local: (x, y) => [(x - box.left) * scale, (y - box.top) * scale], unit: 1, page: { index, aspect: entry.aspect } };
        }
        const layer = this.layer;
        if (!layer) return null;
        const box = chapter.page.getBoundingClientRect();
        const { fontPx } = this.metrics(chapter.body);
        return { key: "text", svg: layer, local: (x, y) => [x - box.left, y - box.top], unit: fontPx };
    }

    // ── a stroke ─────────────────────────────────────────────────────────────

    private beginStroke(event: PointerEvent, surface: Surface): void {
        // A stroke on another page than the note being written closes that note first.
        const open = this.grouping.current();
        if (open && open.strokes[0]?.surface.key !== surface.key) void this.flush("turn", true);
        const el = surface.svg.createSvg("g", { cls: [c("reader-ink-live"), c(`reader-ink--${this.colour}`)] });
        const live: LiveInk = {
            colour: this.colour,
            pointerType: event.pointerType || "mouse",
            stroke: newStroke(event.pointerType || "mouse"),
            el,
            provisional: null,
            surface,
            box: { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
            startedAt: event.timeStamp ?? 0,
        };
        this.live = live;
        this.livePointer = event.pointerId;
        this.grouping.penDown(this.now());
        this.window().clearTimeout(this.idleTimer);
        this.queued = [this.pointOf(event, live)];
        this.drawQueued();
    }

    private window(): Window {
        const stage = this.view.stage();
        return stage ? ownWindow(stage) : ownWindow(this.view.root);
    }

    /** One frame for every move that arrived before it, in the stage's own window (popout-safe). */
    private askFrame(): void {
        if (this.frameAsked) return;
        this.frameAsked = true;
        this.window().requestAnimationFrame(() => {
            this.frameAsked = false;
            this.drawQueued();
        });
    }

    /** The nib's samples, drawn: a path per fixed segment, and the provisional one re-set to the nib. */
    private drawQueued(): void {
        const live = this.live;
        if (!live || this.queued.length === 0) return;
        const points = this.queued;
        this.queued = [];
        let provisional: Segment | null = null;
        for (const point of points) {
            const step = appendPoint(live.stroke, point);
            if (step.committed) this.addPath(live, step.committed);
            provisional = step.provisional;
            const b = live.box;
            if (point.x < b.left) b.left = point.x;
            if (point.y < b.top) b.top = point.y;
            if (point.x > b.right) b.right = point.x;
            if (point.y > b.bottom) b.bottom = point.y;
        }
        if (!provisional) return;
        if (!live.provisional) live.provisional = live.el.createSvg("path", { cls: [c("reader-ink-nib")] });
        // Last in the group, so the nib is always drawn over the ink behind it.
        else live.el.appendChild(live.provisional);
        live.provisional.setAttribute("d", segmentPath(provisional));
        live.provisional.setAttribute("stroke-width", String(round3(provisional.w * live.surface.unit)));
    }

    private addPath(live: LiveInk, seg: Segment): void {
        const path = live.el.createSvg("path", { attr: { d: segmentPath(seg), "stroke-width": String(round3(seg.w * live.surface.unit)) } });
        if (live.provisional) live.el.insertBefore(path, live.provisional);
    }

    /** The pen lifted (or the palette closed under it): the stroke is final, and joins its note. */
    private endStroke(event: PointerEvent | null): void {
        const live = this.live;
        if (!live) return;
        this.drawQueued();
        this.live = null;
        this.livePointer = null;
        this.queued = [];
        // The same curves in a few paths instead of one per point (Risk 3) — not a pixel moves.
        live.el.empty();
        for (const path of mergedPaths(segmentsOf(live.stroke.points, live.pointerType))) {
            live.el.createSvg("path", { attr: { d: path.d, "stroke-width": String(round3(path.w * live.surface.unit)) } });
        }
        live.provisional = null;
        this.penUpNow(event);
        const pad = 0;
        const box = { left: live.box.left - pad, top: live.box.top - pad, right: live.box.right + pad, bottom: live.box.bottom + pad };
        const closed = this.grouping.penUp(live, box, this.now(), live.surface.unit);
        if (closed) void this.writeGroup(closed);
        this.undoStack.push(this.drawnAction(live));
        this.armIdle();
    }

    private penUpNow(event: PointerEvent | null): void {
        if (this.penDown || event?.pointerType === "pen") this.lastPenUpAt = this.now();
        this.penDown = false;
    }

    private armIdle(wait = GROUP_IDLE_MS): void {
        const win = this.window();
        win.clearTimeout(this.idleTimer);
        this.idleTimer = win.setTimeout(() => {
            // A timer is never early by the note's own clock: what is left of the idle time, waited again.
            const open = this.grouping.current();
            if (open && !this.grouping.due(this.now())) {
                if (!this.grouping.isDrawing()) this.armIdle(Math.max(1, open.lastUpAt + GROUP_IDLE_MS - this.now()));
                return;
            }
            void this.flush("idle");
        }, wait);
    }

    // ── keeping a note ───────────────────────────────────────────────────────

    /**
     * Write the open note now — idle, a turn, the Reader closing — and try again any that failed.
     * Never mid-stroke. `force` closes it even when it is not idle yet (a stroke on another page).
     */
    async flush(reason: FlushReason, force = false): Promise<void> {
        this.window().clearTimeout(this.idleTimer);
        const group = this.grouping.flush(force ? "turn" : reason, this.now());
        const retries = this.allNotes().filter((note) => note.state === "unsaved" && note.retry);
        const work: Promise<void>[] = [];
        if (group) work.push(this.writeGroup(group));
        for (const note of retries) work.push(this.save(note));
        await Promise.all(work);
    }

    /** Whether a note is still open, waiting to be written. */
    pendingStrokes(): number {
        return this.grouping.current()?.strokes.length ?? 0;
    }

    private async writeGroup(group: InkGroup<LiveInk>): Promise<void> {
        const chapter = this.chapter;
        const first = group.strokes[0];
        if (!chapter || !first) return;
        const surface = first.surface;
        const box: Box = { left: group.box.left, top: group.box.top, width: group.box.right - group.box.left, height: group.box.bottom - group.box.top };
        const origin: [number, number] = [box.left, box.top];
        const unit = surface.unit;
        const strokes: InkStrokeData[] = group.strokes.map((live) => ({
            colour: live.colour,
            pointerType: live.pointerType,
            points: live.stroke.points.map((pt) => ({ ...pt, x: (pt.x - origin[0]) / unit, y: (pt.y - origin[1]) / unit })),
        }));
        const drawing: InkDrawing = { strokes };
        let input: Parameters<InkStore["writeInk"]>[0];
        let note: KeptNote;
        if (surface.page) {
            const aspect = surface.page.aspect;
            const anchor = pageAnchor(box, { left: 0, top: 0, width: PAGE_EMS, height: PAGE_EMS * aspect });
            input = { about: chapter.notePath, locator: { at: surface.page.index, label: chapter.locator?.label ?? "" }, ink: { page: anchor } };
            note = this.makeNoteEl(surface.svg, null, drawing, "saving");
            note.surface = surface.page.index;
            note.origin = origin;
            note.el.setAttribute("transform", `translate(${round3(origin[0])} ${round3(origin[1])})`);
        } else {
            const page = chapter.page.getBoundingClientRect();
            const { fontPx, linePx } = this.metrics(chapter.body);
            const firstPoint = first.stroke.points[0];
            const near = this.words(chapter.body, page.top + firstPoint.y, linePx);
            const column = this.columnIn(chapter, page);
            const words = near.words.map((w) => ({ ...w, left: w.left - page.left, top: w.top - page.top }));
            const { anchor, word } = anchorInk({ box, first: { x: firstPoint.x, y: firstPoint.y }, words, column, fontPx, linePx, text: near.text });
            const quote = anchor.quote ?? undefined;
            input = {
                about: chapter.notePath,
                ...(quote ? { quote } : {}),
                ...(chapter.locator ? { locator: chapter.locator } : {}),
                ink: { side: anchor.side, x: anchor.x, line: anchor.line, em: anchor.em },
            };
            note = this.makeNoteEl(surface.svg, null, drawing, "saving");
            note.surface = "text";
            note.anchor = anchor;
            note.span = word ? { start: word.start, end: word.end } : null;
            this.place(note, { left: origin[0], top: origin[1], unit });
        }
        // The kept drawing takes the live strokes' place, on the same pixels.
        group.strokes.forEach((live, i) => {
            live.note = note;
            note.strokes[i].from = live;
            live.el.remove();
        });
        note.retry = { input };
        if (typeof note.surface === "number") this.runNotes.push(note);
        else if (this.chapter === chapter) this.notes.push(note);
        await this.save(note);
    }

    /** The reading column and the room beside it, relative to the page. */
    private columnIn(chapter: InkChapter, page: Box): Column {
        const body = chapter.body.getBoundingClientRect();
        const stage = this.view.stage()?.getBoundingClientRect() ?? page;
        return { left: body.left - page.left, width: body.width, outerLeft: stage.left - page.left, outerRight: stage.left + stage.width - page.left };
    }

    /** Write (or try again) one note: the thought and its drawing, one batch (AC-5). */
    private save(note: KeptNote): Promise<void> {
        const work = this.write(note);
        note.saving = work;
        return work;
    }

    private async write(note: KeptNote): Promise<void> {
        const input = note.retry?.input;
        if (!input) return;
        note.state = "saving";
        const svg = renderInkSvg({ strokes: note.strokes.map((s) => s.data) });
        let made: Thought | undefined;
        try {
            made = await withWriteBatch({ kind: "manual", ref: "reader-ink", label: input.about }, () => this.store.writeInk(input, svg));
        } catch (error) {
            log.error(`[Reader] could not keep ink on ${input.about}: ${String(error)}`);
        }
        if (!made) {
            // The strokes stay on screen, unsaved, until the next try or the Reader closes (FR-23).
            note.state = "unsaved";
            this.status("reader_hl_failed");
            return;
        }
        note.thought = made;
        note.state = "kept";
        note.retry = undefined;
        this.listed = [...this.listed.filter((entry) => entry.thought.id !== made?.id), { thought: made, drawing: { strokes: note.strokes.map((s) => s.data) }, reason: null }];
        if (typeof note.surface === "number" && this.runInk) {
            this.runInk.thoughts.push(made);
            this.runInk.drawings.set(made.id, { strokes: note.strokes.map((s) => s.data) });
        }
        // Kept, quietly (FR-23): the ink settles from its live tone to its kept tone. No toast.
        this.settle(note.el);
        this.view.refreshList();
    }

    private settle(el: SVGGElement): void {
        const win = ownWindow(el as unknown as HTMLElement);
        const swap = () => {
            el.removeClass(c("reader-ink--live"));
            el.addClass(c("reader-ink--kept"));
        };
        if (typeof win.requestAnimationFrame === "function") win.requestAnimationFrame(swap);
        else swap();
    }

    /** An ink note drawn from its points: a group per stroke, inside one group the stylesheet places. */
    private makeNoteEl(svg: SVGSVGElement, thought: Thought | null, drawing: InkDrawing, state: KeptNote["state"]): KeptNote {
        const el = svg.createSvg("g", { cls: [c("reader-ink-note"), c(state === "kept" ? "reader-ink--kept" : "reader-ink--live")] });
        if (thought) el.setAttribute("data-ink", thought.id);
        const strokes = drawing.strokes.map((data) => ({ data, el: this.strokeEl(el, data) }));
        return { thought, strokes, el, state, surface: "text" };
    }

    private strokeEl(parent: SVGGElement, data: InkStrokeData): SVGGElement {
        const g = parent.createSvg("g", { cls: [c("reader-ink-stroke"), c(`reader-ink--${data.colour}`)] });
        for (const path of mergedPaths(segmentsOf(data.points, data.pointerType))) g.createSvg("path", { attr: { d: path.d, "stroke-width": String(path.w) } });
        return g;
    }

    private drawNote(thought: Thought, drawing: InkDrawing, anchor: InkAnchor, span: TextSpan | null, state: KeptNote["state"]): KeptNote | null {
        const layer = this.layer;
        if (!layer) return null;
        const note = this.makeNoteEl(layer, thought, drawing, state);
        note.anchor = anchor;
        note.span = span;
        return note;
    }

    /**
     * Ink keeps its place through a change of type (FR-22): every note goes to its words again, in the
     * same frame — no fade, no catch-up. Called by the view whenever the text may have moved.
     */
    layout(): void {
        const chapter = this.chapter;
        if (!chapter || chapter.run) return;
        const page = chapter.page.getBoundingClientRect();
        const { fontPx, linePx } = this.metrics(chapter.body);
        const column = this.columnIn(chapter, page);
        for (const note of this.notes) {
            if (note.surface !== "text" || !note.anchor || !note.span) continue;
            const word = this.spanBox(chapter.body, note.span);
            if (!word) continue;
            const placed = placeInk(note.anchor, { ...word, left: word.left - page.left, top: word.top - page.top }, column, fontPx, linePx);
            // A note written in a wide margin stays on screen when the margin narrows.
            const width = drawingBox({ strokes: note.strokes.map((stroke) => stroke.data) }).right * placed.unit;
            this.place(note, { ...placed, left: keepOnPage(placed.left, width, column) });
        }
    }

    /** A text note where it goes: by three custom properties the stylesheet reads — never an inline style. */
    private place(note: KeptNote, at: { left: number; top: number; unit: number }): void {
        note.placed = { left: at.left, top: at.top, unit: at.unit };
        note.el.setCssProps({ "--zf-ink-x": px(at.left), "--zf-ink-y": px(at.top), "--zf-ink-scale": String(round3(at.unit)) });
    }

    // ── undo, and the eraser ─────────────────────────────────────────────────

    /** The palette's undo, Ctrl/Cmd+Z and the two-finger tap: the session's last ink action (FR-8). */
    async undo(): Promise<boolean> {
        const action = this.undoStack.pop();
        if (!action) return false;
        await action.undo();
        return true;
    }

    /** Ctrl/Cmd+Z: ink's only while the palette is open; otherwise the key is Obsidian's. */
    undoKey(): boolean {
        if (!this.open || this.undoStack.length === 0) return false;
        void this.undo();
        return true;
    }

    /** For later slices (#746, #747): their own steps, on the same undo. */
    pushAction(action: InkAction): void {
        this.undoStack.push(action);
    }

    private drawnAction(live: LiveInk): InkAction {
        return {
            undo: async () => {
                // Not written yet: it simply goes, and nothing is ever written for it (AC-8).
                if (this.grouping.remove(live)) {
                    this.fadeOut(live.el);
                    return;
                }
                const note = live.note;
                // Being written now: the undo waits for the write, then takes the stroke out of the file.
                if (note?.state === "saving") await note.saving;
                const kept = note?.strokes.find((s) => s.from === live);
                if (note && kept) await this.eraseFromNote(note, [kept], false);
            },
        };
    }

    private eraseAt(event: { clientX: number; clientY: number }): void {
        const erasing = this.erasing;
        if (!erasing) return;
        const [x, y] = erasing.surface.local(event.clientX, event.clientY);
        const reach = erasing.surface.page ? ERASER_RADIUS_PX * (PAGE_EMS / Math.max(1, this.slotWidth(erasing.surface))) : ERASER_RADIUS_PX;
        const hit = (segments: Segment[], sx: number, sy: number, scale: number) => segments.some((seg) => distanceToSegment(seg, sx, sy) <= reach / scale + seg.w / 2);
        for (const live of this.grouping.current()?.strokes ?? []) {
            if (live.surface.key !== erasing.surface.key || erasing.hits.has(live)) continue;
            if (hit(segmentsOf(live.stroke.points, live.pointerType).map((s) => ({ ...s, w: s.w * live.surface.unit })), x, y, 1)) {
                erasing.hits.add(live);
                live.el.addClass(c("reader-ink--erasing"));
            }
        }
        for (const note of this.allNotes()) {
            if (note.state === "saving") continue;
            const local = this.inNote(note, x, y, erasing.surface);
            if (!local) continue;
            for (const kept of note.strokes) {
                if (erasing.hits.has(kept)) continue;
                if (hit(segmentsOf(kept.data.points, kept.data.pointerType), local.x, local.y, local.scale)) {
                    erasing.hits.add(kept);
                    kept.el.addClass(c("reader-ink--erasing"));
                }
            }
        }
        erasing.last = [x, y];
    }

    private slotWidth(surface: Surface): number {
        const index = surface.page?.index;
        const entry = index === undefined ? undefined : this.slots.get(index);
        return entry ? this.pageRect(entry).width || 1 : 1;
    }

    /**
     * A printed page's box on screen: its ink surface, which is the whole page — larger than its slot
     * with crop on (#769) — else the slot itself (before the surface is laid out).
     */
    private pageRect(entry: { el: HTMLElement; svg: SVGSVGElement }): DOMRect {
        const box = entry.svg.getBoundingClientRect?.();
        return box && box.width > 0 && box.height > 0 ? box : entry.el.getBoundingClientRect();
    }

    /** A point on a surface, in a note's own ems — or `null` when the note is on another surface. */
    private inNote(note: KeptNote, x: number, y: number, surface: Surface): { x: number; y: number; scale: number } | null {
        if (surface.page) {
            if (note.surface !== surface.page.index || !note.origin) return null;
            return { x: x - note.origin[0], y: y - note.origin[1], scale: 1 };
        }
        if (note.surface !== "text" || !note.placed || !(note.placed.unit > 0)) return null;
        const { left, top, unit } = note.placed;
        return { x: (x - left) / unit, y: (y - top) / unit, scale: unit };
    }

    private finishErase(): void {
        const erasing = this.erasing;
        this.erasing = null;
        if (!erasing) return;
        if (erasing.hits.size === 0) {
            this.status("reader_ink_nothing_erased");
            return;
        }
        const lives = [...erasing.hits].filter((hit): hit is LiveInk => "stroke" in hit);
        const kept = [...erasing.hits].filter((hit): hit is KeptStroke => "data" in hit);
        for (const live of lives) {
            this.grouping.remove(live);
            this.fadeOut(live.el);
        }
        const byNote = new Map<KeptNote, KeptStroke[]>();
        for (const stroke of kept) {
            const note = this.allNotes().find((candidate) => candidate.strokes.includes(stroke));
            if (note) byNote.set(note, [...(byNote.get(note) ?? []), stroke]);
        }
        const undos: (() => Promise<void> | void)[] = [];
        for (const live of lives) {
            undos.push(() => {
                live.el.removeClass(c("reader-ink--erasing"));
                live.surface.svg.appendChild(live.el);
                this.fadeIn(live.el);
                this.grouping.restore(live, live.box, this.now());
                this.armIdle();
            });
        }
        for (const [note, strokes] of byNote) {
            const before = note.strokes.map((s) => s.data);
            const wasKept = note.state === "kept";
            const gone = this.eraseFromNote(note, strokes, true);
            undos.push(async () => {
                const thrown = await gone;
                await this.bringBack(note, before, wasKept, thrown);
            });
        }
        this.undoStack.push({
            undo: async () => {
                for (const run of undos) await run();
            },
        });
    }

    /**
     * Take strokes out of a note (FR-7): the drawing is written again, or — the last stroke gone —
     * the note goes to the trash with its drawing, with Undo (AC-9). Returns the trashed drawing.
     */
    private async eraseFromNote(note: KeptNote, strokes: KeptStroke[], quiet: boolean): Promise<string | undefined> {
        for (const stroke of strokes) this.fadeOut(stroke.el);
        note.strokes = note.strokes.filter((s) => !strokes.includes(s));
        const thought = note.thought;
        if (note.state !== "kept" || !thought) {
            if (note.strokes.length === 0) {
                note.retry = undefined;
                note.el.remove();
                this.forgetNote(note);
            }
            return undefined;
        }
        const label = thought.about ?? "";
        try {
            if (note.strokes.length > 0) {
                const svg = renderInkSvg({ strokes: note.strokes.map((s) => s.data) });
                await withWriteBatch({ kind: "manual", ref: "reader-ink", label }, () => this.store.saveDrawing(thought, svg));
                this.relist(thought, { strokes: note.strokes.map((s) => s.data) });
                return undefined;
            }
            const drawing = (await withWriteBatch({ kind: "manual", ref: "reader-ink", label }, () => this.store.discard(thought))) ?? undefined;
            note.state = "unsaved";
            note.el.remove();
            this.forgetNote(note);
            this.listed = this.listed.filter((entry) => entry.thought.id !== thought.id);
            this.view.refreshList();
            const kept = drawing ?? renderInkSvg({ strokes: [] });
            if (!quiet) this.status("reader_ink_removed", () => void this.restoreNote(note, thought, kept));
            else this.status("reader_ink_removed", () => void this.undo());
            return kept;
        } catch (error) {
            log.error(`[Reader] could not erase ink: ${String(error)}`);
            this.status("reader_hl_failed");
            return undefined;
        }
    }

    /** Undo of an erase: the strokes come back — re-written, or the note restored from the trash. */
    private async bringBack(note: KeptNote, before: InkStrokeData[], wasKept: boolean, thrown: string | undefined): Promise<void> {
        const thought = note.thought;
        const missing = before.filter((data) => !note.strokes.some((s) => s.data === data));
        if (!thought || !wasKept) {
            for (const data of missing) note.strokes.push({ data, el: this.fadeIn(this.strokeEl(note.el, data)) });
            return;
        }
        try {
            if (thrown !== undefined) {
                await withWriteBatch({ kind: "manual", ref: "reader-ink", label: thought.about ?? "" }, () => this.store.restore(thought, thrown));
                note.state = "kept";
                this.parentOf(note)?.appendChild(note.el);
                this.keepNote(note);
            } else {
                const svg = renderInkSvg({ strokes: before });
                await withWriteBatch({ kind: "manual", ref: "reader-ink", label: thought.about ?? "" }, () => this.store.saveDrawing(thought, svg));
            }
        } catch (error) {
            log.error(`[Reader] could not bring ink back: ${String(error)}`);
            this.status("reader_hl_failed");
            return;
        }
        note.strokes = before.map((data) => note.strokes.find((s) => s.data === data) ?? { data, el: this.fadeIn(this.strokeEl(note.el, data)) });
        this.relist(thought, { strokes: before });
    }

    private forgetNote(note: KeptNote): void {
        this.notes = this.notes.filter((n) => n !== note);
        this.runNotes = this.runNotes.filter((n) => n !== note);
    }

    private keepNote(note: KeptNote): void {
        if (typeof note.surface === "number") this.runNotes.push(note);
        else this.notes.push(note);
    }

    private parentOf(note: KeptNote): SVGSVGElement | null {
        if (note.surface === "text") return this.layer;
        return this.slots.get(note.surface)?.svg ?? null;
    }

    private async restoreNote(note: KeptNote, thought: Thought, drawing: string): Promise<void> {
        const before = parseInkSvg(drawing);
        await this.bringBack(note, isUnreadable(before) ? [] : before.strokes, true, drawing);
    }

    private relist(thought: Thought, drawing: InkDrawing): void {
        const entry = this.listed.find((candidate) => candidate.thought.id === thought.id);
        if (entry) entry.drawing = drawing;
        else this.listed.push({ thought, drawing, reason: null });
        this.view.refreshList();
    }

    private fadeOut(el: SVGElement): void {
        const host = el as unknown as HTMLElement;
        if (!motionWelcome(host)) {
            el.remove();
            return;
        }
        const animation = host.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.fast, easing: MOTION.ease, fill: "forwards" });
        animation.onfinish = () => el.remove();
        ownWindow(host).setTimeout(() => el.remove(), MOTION.fast + 200);
    }

    private fadeIn<T extends SVGElement>(el: T): T {
        const host = el as unknown as HTMLElement;
        if (motionWelcome(host)) host.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.fast, easing: MOTION.ease });
        return el;
    }

    // ── two fingers ──────────────────────────────────────────────────────────

    private watchFinger(event: PointerEvent): void {
        if (!this.open) return;
        const at = { x: event.clientX, y: event.clientY, t: event.timeStamp ?? 0 };
        this.fingers.set(event.pointerId, { down: at, up: at, travel: 0, live: true });
    }

    private trackFinger(event: PointerEvent): void {
        const finger = this.fingers.get(event.pointerId);
        if (!finger) return;
        finger.travel = Math.max(finger.travel, Math.hypot(event.clientX - finger.down.x, event.clientY - finger.down.y));
    }

    private liftFinger(event: PointerEvent): void {
        const finger = this.fingers.get(event.pointerId);
        if (!finger) return;
        finger.up = { x: event.clientX, y: event.clientY, t: event.timeStamp ?? 0 };
        finger.live = false;
        if ([...this.fingers.values()].some((f) => f.live)) return;
        const trace = [...this.fingers.values()];
        this.fingers.clear();
        // The fade is the feedback: no confirmation, no toast over the page (FR-21).
        if (this.open && twoFingerTap(trace)) void this.undo();
    }

    // ── the margin's list ────────────────────────────────────────────────────

    /** The chapter's ink notes as rows beside the highlights: a small drawing, a reason, Delete (FR-12). */
    renderList(host: HTMLElement, scope: Component): void {
        if (this.listed.length === 0) return;
        host.createDiv({ cls: c("reader-hl-heading"), text: t("reader_ink_item") });
        for (const entry of this.listed) {
            const row = host.createDiv({ cls: [c("reader-hl-item"), c("reader-ink-item"), ...(entry.reason ? [c("reader-ink-item--listed")] : [])], attr: { "data-ink": entry.thought.id } });
            const thumb = row.createDiv({ cls: c("reader-ink-item-thumb") });
            if (entry.drawing) renderInkThumb(thumb, entry.drawing);
            if (entry.reason) row.createDiv({ cls: c("reader-ink-item-reason"), text: t(entry.reason) });
            const remove = row.createEl("button", { cls: c("reader-hl-link"), text: t("reader_ink_delete"), attr: { type: "button" } });
            scope.registerDomEvent(remove, "click", () => void this.deleteNote(entry.thought));
        }
    }

    /** *Delete* on a row (FR-14): the thought and its drawing go to the trash together, with Undo. */
    private async deleteNote(thought: Thought): Promise<void> {
        let drawing: string | undefined;
        try {
            drawing = (await withWriteBatch({ kind: "manual", ref: "reader-ink", label: thought.about ?? "" }, () => this.store.discard(thought))) ?? undefined;
        } catch (error) {
            log.error(`[Reader] could not delete ink: ${String(error)}`);
            this.status("reader_hl_failed");
            return;
        }
        const note = this.allNotes().find((candidate) => candidate.thought?.id === thought.id);
        if (note) {
            this.fadeOut(note.el);
            this.forgetNote(note);
        }
        const entry = this.listed.find((candidate) => candidate.thought.id === thought.id);
        this.listed = this.listed.filter((candidate) => candidate.thought.id !== thought.id);
        this.view.refreshList();
        this.status("reader_ink_removed", () =>
            void (async () => {
                try {
                    await withWriteBatch({ kind: "manual", ref: "reader-ink", label: thought.about ?? "" }, () => this.store.restore(thought, drawing));
                } catch (error) {
                    log.error(`[Reader] could not restore ink: ${String(error)}`);
                    this.status("reader_hl_failed");
                    return;
                }
                if (entry) this.listed.push(entry);
                if (note) {
                    this.parentOf(note)?.appendChild(note.el);
                    this.fadeIn(note.el);
                    this.keepNote(note);
                }
                this.view.refreshList();
            })()
        );
    }

    /** The reader is closing: anything open is written, the palette's listeners go. */
    dispose(): void {
        this.leave("close");
        this.openScope?.unload();
        this.openScope = null;
        this.window().clearTimeout(this.idleTimer);
        this.window().clearTimeout(this.statusTimer);
        this.runInk = null;
        this.runNotes = [];
        this.slots.clear();
    }
}

function round3(n: number): number {
    return Math.round(n * 1000) / 1000;
}
