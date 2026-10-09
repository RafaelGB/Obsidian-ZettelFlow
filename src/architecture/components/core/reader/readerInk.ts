import { Component, Platform, setIcon, type App } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { anchorAll, anchorQuote, quoteAt, type TextSpan } from "application/thinking/quoteAnchor";
import { isHighlight, isInk, isPageInk, linkThoughts, unlinkThought, type Thought, type ThoughtInk, type ThoughtLocator, type ThoughtQuote } from "application/thinking/thought";
import { meaningOf, type HighlightMeaning } from "application/thinking/highlightMeaning";
import { bandWords, extendsHighlight, isLineStroke, linesOf, strokeMetrics } from "application/reader/ink/strokeHighlight";
import { pageHeadingAt, type PageText } from "application/library/pdfWords";
import { appendPoint, distanceToSegment, mergedPaths, newStroke, segmentPath, segmentsOf, INK_WIDTH_EM, type InkPoint, type LiveStroke, type Segment } from "application/reader/ink/inkStroke";
import { drawingBox, INK_COLOURS, isUnreadable, parseInkSvg, renderInkSvg, type InkColour, type InkDrawing, type InkStrokeData } from "application/reader/ink/inkSvg";
import { anchorInk, keepOnPage, pageAnchor, placeInk, PAGE_EMS, type Box, type Column, type InkAnchor, type WordBox } from "application/reader/ink/inkAnchor";
import { GROUP_IDLE_MS, InkGrouping, type FlushReason, type InkBox, type InkGroup } from "application/reader/ink/inkGroup";
import { altitudeOf, routePointer, twoFingerTap, PALM_WINDOW_MS, type FingerTrace } from "application/reader/ink/inkInput";
import { lassoHolds, lassoWords, recognise, type Gesture, type MarkBox } from "application/reader/ink/gestures";
import { chapterText, pointAt, textNodes } from "./readerMarks";
import { MOTION, motionWelcome } from "./readerMotion";
import { renderInkThumb } from "./readerInkThumb";
import type { KeepOptions, StatusAction } from "./readerHighlights";

type LocaleKey = Parameters<typeof t>[0];

/** Whether the palette was open, on this device only — never synced (FR-1). */
export const INK_STORAGE_KEY = "zettelflow-reader-ink";
/** How close the eraser must pass to a stroke to take it, in px on screen (FR-7). */
export const ERASER_RADIUS_PX = 10;
/** The highlighter's nib before a chapter has said its line height, in px. */
const FALLBACK_NIB_PX = 24;
/** How long a quiet line in the palette stays. */
const STATUS_MS = 6000;
const INK_TOOLS = ["pen", "highlighter", "lasso", "eraser"] as const;
type InkTool = (typeof INK_TOOLS)[number];

/** The colour names, as the palette says them. A literal map, so the locale guardrail sees each key. */
const COLOUR_LABEL: Record<InkColour, LocaleKey> = {
    pencil: "reader_ink_colour_pencil",
    red: "reader_ink_colour_red",
    blue: "reader_ink_colour_blue",
    green: "reader_ink_colour_green",
};
const TOOL_LABEL: Record<InkTool, LocaleKey> = { pen: "reader_ink_pen", highlighter: "reader_ink_highlighter", lasso: "reader_ink_lasso", eraser: "reader_ink_eraser" };
const TOOL_ICON: Record<InkTool, string> = { pen: "pen-line", highlighter: "highlighter", lasso: "lasso", eraser: "eraser" };
/** The lasso's loop, in px on screen: a hairline, dashed once it is closed (#747 FR-15). */
const LASSO_WIDTH_PX = 1.5;

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
    /** A thought written again — an arrow's link (#747 FR-4). */
    save(thought: Thought): Promise<void>;
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
    /** The highlights' engine (#746 FR-3): a stroke across a line keeps its words through it. */
    highlights?(): InkHighlighter | null;
    /** The words of a printed page in Page view (#746 FR-9), or none. */
    pageWords?(index: number): Promise<PageText | null>;
    /** How a printed page is cited: *p. 12*. */
    pageLabel?(index: number): string;
}

/** What a stroke across a line asks of the highlights — the same engine a selection uses (#746). */
export interface InkHighlighter {
    currentMeaning(): HighlightMeaning;
    hasText(): boolean;
    quoteFor(start: number, end: number): { span: TextSpan; quote: ThoughtQuote } | null;
    keepSpan(span: TextSpan, quote: ThoughtQuote, options?: KeepOptions): Promise<Thought | undefined>;
    keepPassage(locator: ThoughtLocator, quote: ThoughtQuote, options?: KeepOptions): Promise<Thought | undefined>;
    extend(thought: Thought, span: TextSpan, options?: Pick<KeepOptions, "direction" | "actions">): Promise<Thought | undefined>;
    unextend(grown: Thought, before: Thought): Promise<boolean>;
    takeBack(thought: Thought): Promise<boolean>;
    /** The gestures' part (#747): the marks on screen, a link adopted, an erase and its undo, the lasso. */
    markBoxes(): { thought: Thought; rects: Box[] }[];
    marksOf(id: string): HTMLElement[];
    adopt(thought: Thought): void;
    erase(thought: Thought): Promise<boolean>;
    unerase(thought: Thought): Promise<HTMLElement[] | null>;
    offerSpan(span: TextSpan, rect: { left: number; top: number; width: number; height?: number }, onClose?: () => void): boolean;
    say(key: LocaleKey, actions?: StatusAction[], onClose?: () => void): void;
    hidePopover(): void;
    hideStatus(): void;
}

/**
 * A highlight a stroke made (#746): kept until its status line goes, so *Undo* and *Keep as ink* can
 * take it back — the second with the stroke itself, written as the ink you drew.
 */
interface StrokeHighlight {
    live: LiveInk;
    /** The thought, once written; `undefined` when the write failed. */
    result: Promise<Thought | undefined>;
    /** An extension: the highlight as it was before this stroke grew it. */
    before?: Thought;
    /** Page view: the printed page and the rectangles drawn for it there. */
    page?: { index: number; marks: HTMLElement[] };
    action: InkAction;
    done: boolean;
    /** What the last stroke highlight was before this one, for an undo to give back. */
    previous?: LastStroke | null;
}

/** The last highlight a stroke made: the next line, drawn soon after on contiguous words, grows it. */
interface LastStroke {
    result: Promise<Thought | undefined>;
    span: TextSpan;
    at: number;
    surface: string;
    entry: StrokeHighlight;
}

/** Seams for tests; the defaults are the real DOM, the real store and the real clock. */
export interface InkDeps {
    store?: InkStore;
    /**
     * The words near `y` (client px) in `body`, in client coordinates, and the chapter's text: within
     * `reach` px of it, four lines when not said.
     */
    words?: (body: HTMLElement, y: number, linePx: number, reach?: number) => { words: WordBox[]; text: string };
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
    /** When the pen went down, by the note's clock: a head drawn soon after a shaft is an arrow's (#747). */
    downAt: number;
    /** Its step on the session's undo while it is ink — taken off when it becomes an arrow's shaft. */
    drawn?: InkAction;
    /** Once written: the kept note it went into. */
    note?: KeptNote;
}

/** What a gesture's end lands on (#747): a highlight, a kept ink note, or the note being written. */
type MarkTarget = { kind: "highlight"; thought: Thought } | { kind: "note"; note: KeptNote } | { kind: "open"; lives: LiveInk[] };

/** The marks near a stroke, as the recogniser sees them, and what each one is. */
interface MarksHere {
    boxes: MarkBox[];
    targets: Map<string, MarkTarget>;
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
function readWords(body: HTMLElement, y: number, linePx: number, within?: number): { words: WordBox[]; text: string } {
    const doc = body.ownerDocument;
    const words: WordBox[] = [];
    let pos = 0;
    const reach = within ?? linePx * 4;
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
    private erasing: { pointer: number; surface: Surface; hits: Set<LiveInk | KeptStroke>; highlights: Map<string, Thought>; marks: MarksHere; last: [number, number] | null } | null = null;
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
    private runInk: { path: string; thoughts: Thought[]; drawings: Map<string, InkDrawing | null>; highlights: Thought[] } | null = null;
    private slots = new Map<number, { el: HTMLElement; svg: SVGSVGElement; aspect: number }>();
    /** The last highlight a stroke made, so the next line drawn soon after grows it (#746 FR-5). */
    private lastStroke: LastStroke | null = null;
    /** The last stroke kept as ink, and when it lifted: an arrow's shaft, if a head follows (#747). */
    private lastInk: { live: LiveInk; at: number } | null = null;
    /** What is fading away now, so an undo that brings it back can call the fade off. */
    private readonly fading = new WeakMap<Element, Animation>();
    /** A printed page's words, read as the page appears (#746 FR-9). */
    private pageTexts = new Map<number, PageText | null>();
    /** A printed page's highlight rectangles (#746 FR-9), by thought. */
    private pageMarks = new Map<number, { layer: HTMLElement; marks: Map<string, HTMLElement[]> }>();

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
        this.lastStroke = null;
        this.lastInk = null;
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
            this.runInk = { path: chapter.notePath, thoughts: [], drawings: new Map(), highlights: [] };
            this.pageTexts.clear();
            this.pageMarks.clear();
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
        let all: Thought[] = [];
        try {
            all = await this.store.highlightsAbout(path);
        } catch (error) {
            log.warn(`[Reader] could not read the ink of ${path}: ${String(error)}`);
        }
        const thoughts = all.filter((thought) => thought.ink && isPageInk(thought.ink));
        const run = this.runInk;
        if (!run || run.path !== path) return;
        run.thoughts = thoughts;
        // The paper's highlights, drawn on their printed pages as rectangles (#746 FR-9).
        run.highlights = all.filter((thought) => isHighlight(thought) && typeof thought.locator?.at === "number");
        for (const index of this.slots.keys()) this.drawPageMarks(index);
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
        // Its words (#746 FR-9): read once it appears, so a stroke across a line finds them at once.
        const layer = el.createDiv({ cls: c("reader-ink-pagemarks"), attr: { "aria-hidden": "true" } });
        this.pageMarks.set(index, { layer, marks: new Map() });
        if (!this.view.pageWords) return;
        this.pageTexts.delete(index);
        void this.view
            .pageWords(index)
            .catch(() => null)
            .then((text) => {
                if (this.slots.get(index)?.el !== el) return;
                this.pageTexts.set(index, text);
                this.drawPageMarks(index);
            });
    }

    /** The highlights of a printed page, as rectangles over their words (#746 FR-9). */
    private drawPageMarks(index: number): void {
        const run = this.runInk;
        const text = this.pageTexts.get(index);
        const page = this.pageMarks.get(index);
        if (!run || !text || !page) return;
        for (const thought of run.highlights) {
            if (thought.locator?.at !== index || !thought.quote || page.marks.has(thought.id)) continue;
            const span = anchorQuote(text.text, thought.quote);
            if (!span) continue;
            page.marks.set(thought.id, this.pageRects(page.layer, text, span, meaningOf(thought)));
        }
    }

    /** One rectangle per run of words on a line, in fractions of the page — exact through any zoom. */
    private pageRects(layer: HTMLElement, text: PageText, span: TextSpan, meaning: HighlightMeaning, fresh?: "ltr" | "rtl"): HTMLElement[] {
        const words = text.words.filter((w) => w.start < span.end && w.end > span.start);
        const height = words.length ? words.reduce((sum, w) => sum + w.height, 0) / words.length : 0;
        const rects: HTMLElement[] = [];
        for (const line of linesOf(words, height)) {
            const left = Math.min(...line.words.map((w) => w.left));
            const right = Math.max(...line.words.map((w) => w.left + w.width));
            const top = Math.min(...line.words.map((w) => w.top));
            const bottom = Math.max(...line.words.map((w) => w.top + w.height));
            const rect = layer.createDiv({
                cls: [c("reader-ink-pagemark"), c(`reader-ink--hl-${meaning}`), ...(fresh ? [c("reader-ink-pagemark--new")] : []), ...(fresh === "rtl" ? [c("reader-ink-pagemark--rtl")] : [])],
            });
            rect.setCssProps({ "--zf-pm-x": pct(left), "--zf-pm-y": pct(top), "--zf-pm-w": pct(right - left), "--zf-pm-h": pct(bottom - top) });
            rects.push(rect);
        }
        return rects;
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
            // The eraser reaches highlights too (#747 FR-6): their boxes, measured once as it goes down.
            const marks = this.marksHere([], false);
            this.erasing = { pointer: event.pointerId, surface, hits: new Set(), highlights: new Map(), marks, last: null };
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
        if (this.tool === "highlighter") {
            // The highlighter looks like one while you draw (#746 FR-15): wide, translucent, in the
            // meaning's own wash — what is under the nib is what you will get.
            const meaning = this.view.highlights?.()?.currentMeaning() ?? "idea";
            el.removeClass(c(`reader-ink--${this.colour}`));
            el.addClass(c("reader-ink--highlighter"), c(`reader-ink--hl-${meaning}`));
            el.setCssProps({ "--zf-hl-nib": String(round3(this.nibWidth(surface))) });
        }
        if (this.tool === "lasso") {
            // The lasso draws a hairline loop in the accent colour, never ink (#747 FR-7).
            el.removeClass(c(`reader-ink--${this.colour}`));
            el.addClass(c("reader-ink--lasso"));
            el.setCssProps({ "--zf-lasso-w": String(round3(LASSO_WIDTH_PX * this.pxUnit(surface))) });
        }
        const live: LiveInk = {
            colour: this.colour,
            pointerType: event.pointerType || "mouse",
            stroke: newStroke(event.pointerType || "mouse"),
            el,
            provisional: null,
            surface,
            box: { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
            startedAt: event.timeStamp ?? 0,
            downAt: this.now(),
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
        // The lasso selects, and is never ink (#747 FR-7).
        if (this.tool === "lasso") {
            this.grouping.cancel();
            if (event) this.finishLasso(live);
            else live.el.remove();
            if (this.grouping.current()) this.armIdle();
            return;
        }
        // Drawn across a line — or with the highlighter — it is a highlight, not ink (#746); a circle,
        // an arrow between marks or a scribble is that gesture (#747).
        if (event && (this.highlightStroke(live) || this.gesture(live))) {
            this.grouping.cancel();
            if (this.grouping.current()) this.armIdle();
            return;
        }
        const pad = 0;
        const box = { left: live.box.left - pad, top: live.box.top - pad, right: live.box.right + pad, bottom: live.box.bottom + pad };
        const closed = this.grouping.penUp(live, box, this.now(), live.surface.unit);
        if (closed) void this.writeGroup(closed);
        live.drawn = this.drawnAction(live);
        this.undoStack.push(live.drawn);
        if (this.tool === "pen") this.lastInk = { live, at: this.now() };
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

    // ── a stroke across a line is a highlight (#746) ─────────────────────────

    /** The highlighter's nib: about a line tall, in the surface's own units. */
    private nibWidth(surface: Surface): number {
        const chapter = this.chapter;
        if (surface.page) return this.pageLine(surface.page.index, surface.page.aspect) * 0.9;
        return chapter ? this.metrics(chapter.body).linePx * 0.9 : FALLBACK_NIB_PX;
    }

    /** A printed page's line height, in its ems: from its words' heights, or a paper's usual line. */
    private pageLine(index: number, aspect: number): number {
        const words = this.pageTexts.get(index)?.words ?? [];
        if (words.length === 0) return 0.8;
        const heights = words.map((w) => w.height).sort((a, b) => a - b);
        return heights[Math.floor(heights.length / 2)] * PAGE_EMS * aspect;
    }

    /**
     * At pen-up (#746 FR-1, FR-6): a pen stroke that runs along a line of text — or any highlighter
     * stroke over text — keeps the words under it as a highlight, through the one engine a selection
     * uses. Returns whether it did: otherwise the stroke stays ink, as it was drawn.
     */
    private highlightStroke(live: LiveInk): boolean {
        if (this.tool !== "pen" && this.tool !== "highlighter") return false;
        const highlighter = this.tool === "highlighter";
        const engine = this.view.highlights?.() ?? null;
        const chapter = this.chapter;
        if (!engine || !chapter) return highlighter && this.nothingUnder(live);
        const points = live.stroke.points;
        const metrics = strokeMetrics(points);
        if (live.surface.page) return this.highlightOnPage(live, engine, metrics, highlighter);
        if (!engine.hasText()) return highlighter && this.nothingUnder(live);
        const { fontPx, linePx } = this.metrics(chapter.body);
        if (!highlighter && !isLineStroke(metrics, { linePx, emPx: fontPx })) return false;
        const page = chapter.page.getBoundingClientRect();
        const near = this.words(chapter.body, page.top + metrics.meanY, linePx);
        const words = near.words.map((w) => ({ ...w, left: w.left - page.left, top: w.top - page.top }));
        const band = bandWords(points, words, linePx);
        const found = band ? engine.quoteFor(band.span.start, band.span.end) : null;
        if (!band || !found) return highlighter && this.nothingUnder(live);
        const last = this.lastStroke;
        const extend = last && last.surface === live.surface.key && extendsHighlight(last, band.span, near.text, this.now()) ? last : null;
        const entry = this.strokeEntry(live);
        if (extend) {
            // One highlight, grown (FR-5): one recorded update of the one thought.
            const keep = () => engine.keepSpan(found.span, found.quote, { meaning: engine.currentMeaning(), origin: "stroke", direction: metrics.direction, actions: () => this.strokeActions(entry) });
            entry.result = extend.result.then(async (before) => {
                // Nothing to grow any more (taken back, or its words gone): a highlight of its own.
                if (!before) return keep();
                entry.before = before;
                const grown = await engine.extend(before, band.span, { direction: metrics.direction, actions: () => this.strokeActions(entry) });
                if (grown) return grown;
                entry.before = undefined;
                return keep();
            });
        } else {
            entry.result = engine.keepSpan(found.span, found.quote, { meaning: engine.currentMeaning(), origin: "stroke", direction: metrics.direction, actions: () => this.strokeActions(entry) });
        }
        // The ink becomes the mark (FR-11): the marks are on the words now, and the stroke fades.
        this.fadeOut(live.el, MOTION.base);
        const union = extend ? { start: Math.min(extend.span.start, band.span.start), end: Math.max(extend.span.end, band.span.end) } : found.span;
        this.remember(entry, union, live.surface.key);
        return true;
    }

    /**
     * The same on a printed page in Page view (#746 FR-9): the page's own words, from its text runs.
     * A page with none — a scan — leaves a pen stroke as ink (AC-8).
     */
    private highlightOnPage(live: LiveInk, engine: InkHighlighter, metrics: ReturnType<typeof strokeMetrics>, highlighter: boolean): boolean {
        const page = live.surface.page;
        const text = page ? this.pageTexts.get(page.index) : null;
        const marks = page ? this.pageMarks.get(page.index) : undefined;
        if (!page || !text || text.words.length === 0 || !marks) return highlighter && this.nothingUnder(live);
        // The page's words in its own ems, as the stroke's points are.
        const tall = PAGE_EMS * page.aspect;
        const words = text.words.map((w) => ({ ...w, left: w.left * PAGE_EMS, top: w.top * tall, width: w.width * PAGE_EMS, height: w.height * tall }));
        const line = this.pageLine(page.index, page.aspect) * 1.2;
        const em = line / 1.2;
        if (!highlighter && !isLineStroke(metrics, { linePx: line, emPx: em })) return false;
        const band = bandWords(live.stroke.points, words, line);
        const made = band ? quoteAt(text.text, band.span.start, band.span.end) : null;
        if (!band || !made) return highlighter && this.nothingUnder(live);
        const heading = pageHeadingAt(text, made.span.start);
        const quote: ThoughtQuote = { ...made.quote, ...(heading ? { heading } : {}) };
        const meaning = engine.currentMeaning();
        // Marked at once (FR-12), sweeping from the side the stroke began; the write follows.
        const rects = this.pageRects(marks.layer, text, made.span, meaning, metrics.direction);
        const entry = this.strokeEntry(live);
        entry.page = { index: page.index, marks: rects };
        const locator: ThoughtLocator = { at: page.index, label: this.view.pageLabel?.(page.index) ?? this.chapter?.locator?.label ?? "" };
        entry.result = engine.keepPassage(locator, quote, { meaning, origin: "stroke", direction: metrics.direction, actions: () => this.strokeActions(entry) }).then((thought) => {
            if (!thought) rects.forEach((rect) => rect.remove());
            else {
                marks.marks.set(thought.id, rects);
                this.runInk?.highlights.push(thought);
            }
            return thought;
        });
        this.fadeOut(live.el, MOTION.base);
        return true;
    }

    /** A highlighter stroke over no text (FR-6): nothing is kept, and the palette says so. */
    private nothingUnder(live: LiveInk): boolean {
        this.fadeOut(live.el, MOTION.base);
        this.status("reader_ink_nothing_under");
        return true;
    }

    /** A highlight a stroke made, on the session's undo (#745 E8): the palette, Ctrl/⌘+Z, two fingers. */
    private strokeEntry(live: LiveInk): StrokeHighlight {
        const entry: StrokeHighlight = { live, result: Promise.resolve(undefined), action: { undo: () => this.takeBackStroke(entry) }, done: false };
        this.undoStack.push(entry.action);
        return entry;
    }

    /** Remember the last stroke highlight — at once, its thought to come — for the next line to grow it. */
    private remember(entry: StrokeHighlight, span: TextSpan, surface: string): void {
        entry.previous = this.lastStroke;
        this.lastStroke = { result: entry.result, span, at: this.now(), surface, entry };
    }

    /** What the status line offers (FR-7): *Undo*, and *Keep as ink*. */
    private strokeActions(entry: StrokeHighlight): StatusAction[] {
        return [
            { key: "reader_hl_undo", run: () => void this.takeBackStroke(entry) },
            { key: "reader_ink_keep_as_ink", run: () => void this.keepAsInk(entry) },
        ];
    }

    private settleEntry(entry: StrokeHighlight): boolean {
        if (entry.done) return false;
        entry.done = true;
        const at = this.undoStack.indexOf(entry.action);
        if (at >= 0) this.undoStack.splice(at, 1);
        // Taken back: the next line grows what was there before this stroke, if anything.
        if (this.lastStroke?.entry === entry) this.lastStroke = entry.previous ?? null;
        return true;
    }

    /** Undo (FR-7, FR-14): the highlight goes — an extension goes back to what it was — its mark fading. */
    private async takeBackStroke(entry: StrokeHighlight): Promise<void> {
        if (!this.settleEntry(entry)) return;
        await this.unmake(entry);
    }

    /** Take a stroke's highlight back; whether it went (a failed write leaves it, and says so). */
    private async unmake(entry: StrokeHighlight): Promise<boolean> {
        const engine = this.view.highlights?.() ?? null;
        const thought = await entry.result;
        if (!engine || !thought) return true;
        if (entry.before) return engine.unextend(thought, entry.before);
        if (!(await engine.takeBack(thought))) return false;
        this.dropPageMarks(entry, thought);
        return true;
    }

    /**
     * *Keep as ink* (FR-7, FR-14): the highlight goes and the stroke comes back where it was drawn,
     * kept as an ink note — one action, recorded as one batch.
     */
    private async keepAsInk(entry: StrokeHighlight): Promise<void> {
        if (!this.settleEntry(entry)) return;
        const chapter = this.chapter;
        const live = entry.live;
        if (!chapter) return;
        let kept = false;
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-ink", label: chapter.notePath }, async () => {
                // The highlight stays when it could not be taken back: never both, never neither.
                if (!(await this.unmake(entry))) return;
                kept = true;
                await this.writeGroup({ strokes: [live], box: live.box, lastUpAt: this.now() }, true);
            });
        } catch (error) {
            log.error(`[Reader] could not keep a stroke as ink: ${String(error)}`);
            this.status("reader_hl_failed");
            return;
        }
        if (kept) this.undoStack.push(this.drawnAction(live));
    }

    private dropPageMarks(entry: StrokeHighlight, thought: Thought): void {
        if (!entry.page) return;
        this.pageMarks.get(entry.page.index)?.marks.delete(thought.id);
        if (this.runInk) this.runInk.highlights = this.runInk.highlights.filter((t) => t.id !== thought.id);
        for (const rect of entry.page.marks) this.fadeOut(rect);
    }

    // ── circle, arrow, scribble and lasso (#747) ─────────────────────────────

    /** Surface units per px on screen: 1 over the text, a printed page's ems per px on it. */
    private pxUnit(surface: Surface): number {
        return surface.page ? PAGE_EMS / Math.max(1, this.slotWidth(surface)) : 1;
    }

    /**
     * The marks on the text a gesture can act on, in the page's own px: the highlights, the kept ink
     * notes, and the note being written — never the strokes in `skip`, which are the gesture itself.
     */
    private marksHere(skip: readonly LiveInk[] = [], inkToo = true): MarksHere {
        const boxes: MarkBox[] = [];
        const targets = new Map<string, MarkTarget>();
        const chapter = this.chapter;
        if (!chapter || chapter.run) return { boxes, targets };
        const page = chapter.page.getBoundingClientRect();
        for (const { thought, rects } of this.view.highlights?.()?.markBoxes() ?? []) {
            const id = `hl:${thought.id}`;
            targets.set(id, { kind: "highlight", thought });
            boxes.push({ ref: { kind: "highlight", id }, rects: rects.map((r) => ({ ...r, left: r.left - page.left, top: r.top - page.top })) });
        }
        if (!inkToo) return { boxes, targets };
        this.notes.forEach((note, i) => {
            const box = this.noteBox(note);
            if (!box || (note.state === "unsaved" && !note.thought)) return;
            const id = `ink:${i}`;
            targets.set(id, { kind: "note", note });
            boxes.push({ ref: { kind: "ink", id }, rects: [box] });
        });
        const open = (this.grouping.current()?.strokes ?? []).filter((live) => !skip.includes(live) && !live.surface.page);
        if (open.length > 0) {
            const box = open.reduce((b, live) => ({ left: Math.min(b.left, live.box.left), top: Math.min(b.top, live.box.top), right: Math.max(b.right, live.box.right), bottom: Math.max(b.bottom, live.box.bottom) }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
            targets.set("open", { kind: "open", lives: open });
            boxes.push({ ref: { kind: "ink", id: "open" }, rects: [{ left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top }] });
        }
        return { boxes, targets };
    }

    /** Where a kept text note is now, in the page's px. */
    private noteBox(note: KeptNote): Box | null {
        if (note.surface !== "text" || !note.placed) return null;
        const b = drawingBox({ strokes: note.strokes.map((s) => s.data) });
        const { left, top, unit } = note.placed;
        return { left: left + b.left * unit, top: top + b.top * unit, width: (b.right - b.left) * unit, height: (b.bottom - b.top) * unit };
    }

    /** Where a note is on a surface, in its units: what the lasso holds. */
    private noteBoxOn(note: KeptNote, surface: Surface): Box | null {
        if (!surface.page) return this.noteBox(note);
        if (note.surface !== surface.page.index || !note.origin) return null;
        const b = drawingBox({ strokes: note.strokes.map((s) => s.data) });
        return { left: note.origin[0] + b.left, top: note.origin[1] + b.top, width: b.right - b.left, height: b.bottom - b.top };
    }

    /**
     * At pen-up, after the line (#747 FR-1): a circle round words, an arrow between two marks, a
     * scribble over marks — judged by the one recogniser. Returns whether the stroke was a gesture;
     * otherwise it stays the ink it was drawn as. The reading view only: a printed page keeps its line.
     */
    private gesture(live: LiveInk): boolean {
        const chapter = this.chapter;
        if (this.tool !== "pen" || !chapter || chapter.run || live.surface.page) return false;
        const points = live.stroke.points;
        if (points.length < 3) return false;
        const { fontPx, linePx } = this.metrics(chapter.body);
        const page = chapter.page.getBoundingClientRect();
        const box = live.box;
        const near = this.words(chapter.body, page.top + (box.top + box.bottom) / 2, linePx, (box.bottom - box.top) / 2 + linePx * 2);
        const words = near.words.map((w) => ({ ...w, left: w.left - page.left, top: w.top - page.top }));
        const shaft = this.shaftFor(live);
        // A short head drawn soon after a straight stroke: the two are one arrow (FR-4) — its shaft is
        // no mark of its own.
        if (shaft) {
            const marks = this.marksHere([live, shaft]);
            const two = recognise({ strokes: [shaft.stroke.points, points], gapMs: live.downAt - (this.lastInk?.at ?? live.downAt) }, { words, marks: marks.boxes, linePx, emPx: fontPx });
            if (two.kind === "arrow") return this.linkGesture(two, [shaft, live], marks);
            if (two.kind === "arrow-unanchored") {
                this.status("reader_ink_arrow_needs_marks");
                return false;
            }
        }
        const marks = this.marksHere([live]);
        const one = recognise({ strokes: [points] }, { words, marks: marks.boxes, linePx, emPx: fontPx });
        if (one.kind === "circle") return this.circleGesture(live, one);
        if (one.kind === "arrow") return this.linkGesture(one, [live], marks);
        if (one.kind === "scribble") return this.scribbleGesture(live, one, marks);
        if (one.kind === "arrow-unanchored") this.status("reader_ink_arrow_needs_marks");
        return false;
    }

    /** The stroke just before this one, if it can be an arrow's shaft: still ink, on this page, and just now. */
    private shaftFor(live: LiveInk): LiveInk | null {
        const last = this.lastInk;
        if (!last || last.live === live || last.live.surface.key !== live.surface.key) return null;
        if (!this.grouping.current()?.strokes.includes(last.live)) return null;
        return live.downAt - last.at <= GROUP_IDLE_MS ? last.live : null;
    }

    /**
     * A gesture on the session's undo (FR-8): the palette's undo, Ctrl/⌘+Z and two fingers take it
     * back, as its status line's Undo and *Keep as ink* do — once, whichever comes first. Returns the
     * claim: `true` the first time.
     */
    private pushStep(undo: () => Promise<unknown>): () => boolean {
        let done = false;
        const action: InkAction = {
            undo: async () => {
                if (!settle()) return;
                // Taken back from the palette or with two fingers: its line, and its Undo, go with it —
                // never a note being written.
                this.view.highlights?.()?.hideStatus();
                await undo();
            },
        };
        const settle = () => {
            if (done) return false;
            done = true;
            const at = this.undoStack.indexOf(action);
            if (at >= 0) this.undoStack.splice(at, 1);
            return true;
        };
        this.undoStack.push(action);
        return settle;
    }

    /**
     * A circle round words keeps them as a **question** (FR-3): the one highlight engine, exactly as a
     * selection with *Question* would — and the meaning H uses stays yours. Undo and *Keep as ink* are
     * a stroke highlight's (#746).
     */
    private circleGesture(live: LiveInk, g: Extract<Gesture, { kind: "circle" }>): boolean {
        const engine = this.view.highlights?.() ?? null;
        const found = engine?.hasText() ? engine.quoteFor(g.span.start, g.span.end) : null;
        if (!engine || !found) return false;
        this.lastInk = null;
        const entry = this.strokeEntry(live);
        entry.result = engine.keepSpan(found.span, found.quote, { meaning: "question", origin: "stroke", status: "reader_ink_circled", remember: false, actions: () => this.strokeActions(entry) });
        this.ring(live, g.words);
        return true;
    }

    /**
     * The circle becomes the mark (FR-12): your stroke gives way to a clean ring where you drew it,
     * which tightens onto its words and fades as their question wash sweeps in. Transform and opacity
     * only; under reduced motion the stroke simply goes and the mark is there.
     */
    private ring(live: LiveInk, words: readonly Box[]): void {
        const host = live.el as unknown as HTMLElement;
        if (!motionWelcome(host)) {
            live.el.remove();
            return;
        }
        const b = live.box;
        const left = Math.min(...words.map((w) => w.left));
        const top = Math.min(...words.map((w) => w.top));
        const right = Math.max(...words.map((w) => w.left + w.width));
        const bottom = Math.max(...words.map((w) => w.top + w.height));
        const ring = live.surface.svg.createSvg("ellipse", {
            cls: [c("reader-ink-ring"), c("reader-ink--hl-question")],
            attr: {
                cx: String(round3((b.left + b.right) / 2)),
                cy: String(round3((b.top + b.bottom) / 2)),
                rx: String(round3((b.right - b.left) / 2)),
                ry: String(round3((b.bottom - b.top) / 2)),
                "stroke-width": String(round3(INK_WIDTH_EM * 1.4 * live.surface.unit)),
                "aria-hidden": "true",
            },
        });
        // Toward the words' middle, so it tightens onto them.
        ring.setCssProps({ "--zf-ink-origin": `${round3((left + right) / 2)}px ${round3((top + bottom) / 2)}px` });
        this.fadeOut(live.el, MOTION.fast);
        const ringHost = ring as unknown as HTMLElement;
        const animation = ringHost.animate(
            [
                { opacity: 0, transform: "scale(1.03)" },
                { opacity: 1, transform: "scale(1)", offset: 0.3 },
                { opacity: 0, transform: "scale(0.92)" },
            ],
            { duration: MOTION.base, easing: MOTION.ease, fill: "forwards" }
        );
        animation.onfinish = () => ring.remove();
        ownWindow(ringHost).setTimeout(() => ring.remove(), MOTION.base + 200);
    }

    /**
     * An arrow between two marks links their thoughts, both ways, with Think's plain connection
     * (FR-4): no direction, never a relation. The arrow fades and the two marks brighten once (FR-13)
     * before anything is written; both thoughts are saved in one recorded batch.
     */
    private linkGesture(g: Extract<Gesture, { kind: "arrow" }>, strokes: LiveInk[], marks: MarksHere): boolean {
        const from = marks.targets.get(g.from.id);
        const to = marks.targets.get(g.to.id);
        const chapter = this.chapter;
        if (!from || !to || !chapter) return false;
        this.lastInk = null;
        for (const live of strokes) {
            this.grouping.remove(live);
            this.fadeOut(live.el, MOTION.base);
            // A shaft that was ink until its head came: its own undo step goes, the arrow's takes its place.
            const at = live.drawn ? this.undoStack.indexOf(live.drawn) : -1;
            if (at >= 0) this.undoStack.splice(at, 1);
            live.drawn = undefined;
        }
        for (const id of [g.from.id, g.to.id]) this.flash(marks.boxes.find((box) => box.ref.id === id)?.rects ?? []);
        const label = chapter.notePath;
        const work = (async (): Promise<{ ids: string[]; added: boolean[]; fallback: Thought[] } | null> => {
            const left = await this.thoughtOf(from);
            const right = await this.thoughtOf(to);
            if (!left || !right || left.id === right.id) return null;
            const pair = linkThoughts(left, right);
            // Which side the arrow added a link to: a link that was there already is not the arrow's.
            const added = [pair[0] !== left, pair[1] !== right];
            try {
                await withWriteBatch({ kind: "manual", ref: "reader-ink", label }, async () => {
                    for (const thought of pair) await this.store.save(thought);
                });
            } catch (error) {
                log.error(`[Reader] could not link two marks: ${String(error)}`);
                this.status("reader_hl_failed");
                return null;
            }
            pair.forEach((thought) => this.adoptThought(thought));
            return { ids: [left.id, right.id], added, fallback: pair };
        })();
        /**
         * The link taken back (FR-8): the link the arrow added, and only it, dropped from each thought as
         * it is **now** — a meaning or a note changed since stays. One batch. Whether it went.
         */
        const unlink = async (): Promise<boolean> => {
            const done = await work;
            if (!done) return true;
            const now = done.ids.map((id, i) => this.currentThought(id) ?? done.fallback[i]);
            const before = now.map((thought, i) => (done.added[i] ? unlinkThought(thought, done.ids[1 - i]) : thought));
            try {
                await withWriteBatch({ kind: "manual", ref: "reader-ink", label }, async () => {
                    for (const [i, thought] of before.entries()) if (done.added[i]) await this.store.save(thought);
                });
            } catch (error) {
                log.error(`[Reader] could not take a link back: ${String(error)}`);
                this.status("reader_hl_failed");
                return false;
            }
            before.forEach((thought) => this.adoptThought(thought));
            return true;
        };
        const settle = this.pushStep(unlink);
        void work.then((done) => {
            if (!done) {
                settle();
                return;
            }
            this.say("reader_ink_linked", [
                { key: "reader_hl_undo", run: () => void (settle() && unlink()) },
                { key: "reader_ink_keep_as_ink", run: () => void (settle() && this.keepGestureAsInk(unlink, strokes)) },
            ]);
        });
        return true;
    }

    /** *Keep as ink* after a gesture (FR-8, AC-7): it is taken back and its strokes kept as ink — one batch. */
    private async keepGestureAsInk(undo: () => Promise<boolean>, strokes: LiveInk[]): Promise<void> {
        const chapter = this.chapter;
        if (!chapter) return;
        let kept = false;
        const box = strokes.reduce((b, live) => ({ left: Math.min(b.left, live.box.left), top: Math.min(b.top, live.box.top), right: Math.max(b.right, live.box.right), bottom: Math.max(b.bottom, live.box.bottom) }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-ink", label: chapter.notePath }, async () => {
                // Never both, never neither: the ink is written only once the gesture is gone.
                if (!(await undo())) return;
                kept = true;
                await this.writeGroup({ strokes, box, lastUpAt: this.now() }, true);
            });
        } catch (error) {
            log.error(`[Reader] could not keep a gesture as ink: ${String(error)}`);
            this.status("reader_hl_failed");
            return;
        }
        if (kept)
            for (const live of strokes) {
                live.drawn = this.drawnAction(live);
                this.undoStack.push(live.drawn);
            }
    }

    /** The thought a mark is — waiting for a note being written, and writing the open one first (G3). */
    private async thoughtOf(target: MarkTarget): Promise<Thought | null> {
        if (target.kind === "highlight") return target.thought;
        let note: KeptNote | undefined;
        if (target.kind === "open") {
            if (this.grouping.current()?.strokes.some((live) => target.lives.includes(live))) await this.flush("turn", true);
            note = target.lives.find((live) => live.note)?.note;
        } else note = target.note;
        if (note?.state === "saving") await note.saving;
        return note?.thought ?? null;
    }

    /** The thought on screen by id, as it is now: a highlight's or an ink note's. */
    private currentThought(id: string): Thought | null {
        const highlight = this.view.highlights?.()?.markBoxes().find((box) => box.thought.id === id)?.thought;
        return highlight ?? this.allNotes().find((note) => note.thought?.id === id)?.thought ?? null;
    }

    /** A thought saved again: the highlight or the ink note on screen is that one now. */
    private adoptThought(thought: Thought): void {
        this.view.highlights?.()?.adopt(thought);
        for (const note of this.allNotes()) if (note.thought?.id === thought.id) note.thought = thought;
        for (const entry of this.listed) if (entry.thought.id === thought.id) entry.thought = thought;
    }

    /** A mark brightens once (FR-13): a wash over each of its boxes, opacity only, gone at the end. */
    private flash(rects: readonly Box[]): void {
        const page = this.chapter?.page;
        if (!page || !motionWelcome(page)) return;
        for (const rect of rects) {
            const wash = page.createDiv({ cls: c("reader-ink-flash"), attr: { "aria-hidden": "true" } });
            wash.setCssProps({ "--zf-flash-x": px(rect.left), "--zf-flash-y": px(rect.top), "--zf-flash-w": px(rect.width), "--zf-flash-h": px(rect.height) });
            const animation = wash.animate([{ opacity: 0 }, { opacity: 0.5, offset: 0.4 }, { opacity: 0 }], { duration: MOTION.base, easing: MOTION.ease, fill: "forwards" });
            animation.onfinish = () => wash.remove();
            ownWindow(page).setTimeout(() => wash.remove(), MOTION.base + 200);
        }
    }

    /**
     * A scribble over marks erases them (FR-5): the ink strokes it touches and the highlights it
     * crosses, fading with it, as one action. It is never kept itself; over nothing it erases nothing.
     */
    private scribbleGesture(live: LiveInk, g: Extract<Gesture, { kind: "scribble" }>, marks: MarksHere): boolean {
        this.lastInk = null;
        const highlights = g.hits.flatMap((ref) => {
            const target = marks.targets.get(ref.id);
            return target?.kind === "highlight" ? [target.thought] : [];
        });
        const hits = new Set<LiveInk | KeptStroke>();
        const segments = new Map<LiveInk | KeptStroke, Segment[]>();
        for (const pt of live.stroke.points) this.strokesAt(pt.x, pt.y, live.surface, hits, ERASER_RADIUS_PX / 2, [live], undefined, segments);
        this.fadeOut(live.el, MOTION.fast);
        if (highlights.length === 0 && hits.size === 0) {
            this.status("reader_ink_nothing_to_erase");
            return true;
        }
        this.eraseAll(hits, highlights, true);
        return true;
    }

    /**
     * The lasso, at pen-up (FR-7): words inside the loop open the selection popover for exactly those
     * words; ink notes alone offer *Delete*; nothing says so. The lasso never writes by itself, and its
     * loop stays, dashed, while what it caught is offered (FR-15).
     */
    private finishLasso(live: LiveInk): void {
        const chapter = this.chapter;
        const engine = this.view.highlights?.() ?? null;
        const points = live.stroke.points;
        const loop = this.closeLoop(live);
        const surface = live.surface;
        if (chapter && !surface.page && engine?.hasText()) {
            const page = chapter.page.getBoundingClientRect();
            const { linePx } = this.metrics(chapter.body);
            const box = live.box;
            const near = this.words(chapter.body, page.top + (box.top + box.bottom) / 2, linePx, (box.bottom - box.top) / 2 + linePx);
            const held = lassoWords(
                points,
                near.words.map((w) => ({ ...w, left: w.left - page.left, top: w.top - page.top }))
            );
            const rect = { left: page.left + box.left, top: page.top + box.top, width: box.right - box.left, height: box.bottom - box.top };
            if (held && engine.offerSpan(held.span, rect, () => this.fadeOut(loop, MOTION.fast))) return;
        }
        const notes = this.allNotes().filter((note) => {
            const box = note.thought && note.state === "kept" ? this.noteBoxOn(note, surface) : null;
            return box !== null && lassoHolds(points, box);
        });
        if (notes.length > 0 && engine) {
            engine.say("reader_ink_lasso_held", [
                    {
                        key: "reader_ink_delete",
                        run: () => {
                            // Chosen: the offer and its loop go, and the notes with them.
                            engine.hidePopover();
                            void this.deleteNotes(notes);
                        },
                    },
                ], () => this.fadeOut(loop, MOTION.fast));
            return;
        }
        this.fadeOut(loop, MOTION.fast);
        this.status("reader_ink_lasso_nothing");
    }

    /** The lasso's loop, closed: one dashed path where it was drawn, a shimmer as it closes (FR-15). */
    private closeLoop(live: LiveInk): SVGGElement {
        const el = live.el;
        el.empty();
        const d = live.stroke.points.map((pt, i) => `${i === 0 ? "M" : "L"}${round3(pt.x)} ${round3(pt.y)}`).join(" ");
        el.createSvg("path", { cls: [c("reader-ink-lasso-loop")], attr: { d: `${d} Z` } });
        el.addClass(c("reader-ink--lasso-closed"));
        const host = el as unknown as HTMLElement;
        if (motionWelcome(host)) host.animate([{ opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }], { duration: MOTION.base, easing: MOTION.ease });
        return el;
    }

    /** *Delete* for the ink notes a lasso caught: to the trash with their drawings, one batch, with Undo. */
    private async deleteNotes(notes: KeptNote[]): Promise<void> {
        const chapter = this.chapter;
        const thrown: { note: KeptNote; thought: Thought; drawing: string | undefined }[] = [];
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-ink", label: chapter?.notePath ?? "" }, async () => {
                for (const note of notes) {
                    const thought = note.thought;
                    if (!thought) continue;
                    const drawing = (await this.store.discard(thought)) ?? undefined;
                    thrown.push({ note, thought, drawing });
                    this.fadeOut(note.el);
                    this.forgetNote(note);
                    this.listed = this.listed.filter((entry) => entry.thought.id !== thought.id);
                }
            });
        } catch (error) {
            log.error(`[Reader] could not delete ink: ${String(error)}`);
            this.status("reader_hl_failed");
        }
        this.view.refreshList();
        if (thrown.length === 0) return;
        this.status("reader_ink_removed", () =>
            void (async () => {
                try {
                    await withWriteBatch({ kind: "manual", ref: "reader-ink", label: chapter?.notePath ?? "" }, async () => {
                        for (const { thought, drawing } of thrown) await this.store.restore(thought, drawing);
                    });
                } catch (error) {
                    log.error(`[Reader] could not restore ink: ${String(error)}`);
                    this.status("reader_hl_failed");
                    return;
                }
                for (const { note, thought, drawing } of thrown) {
                    this.parentOf(note)?.appendChild(note.el);
                    this.fadeIn(note.el);
                    this.keepNote(note);
                    const parsed = drawing ? parseInkSvg(drawing) : null;
                    this.listed.push({ thought, drawing: parsed && !isUnreadable(parsed) ? parsed : null, reason: null });
                }
                this.view.refreshList();
            })()
        );
    }

    /** What a gesture says it did (FR-8), with its ways back: low on the page, as a stroke highlight's. */
    private say(key: LocaleKey, actions: StatusAction[]): void {
        const engine = this.view.highlights?.() ?? null;
        if (engine) engine.say(key, actions);
        else this.status(key, actions[0] ? () => actions[0].run() : undefined);
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

    private async writeGroup(group: InkGroup<LiveInk>, appear = false): Promise<void> {
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
        // Kept as ink (#746 FR-14): the stroke fades back in where it was drawn.
        if (appear) this.fadeIn(note.el);
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
        const reach = ERASER_RADIUS_PX * this.pxUnit(erasing.surface);
        this.strokesAt(x, y, erasing.surface, erasing.hits, reach, [], (hit) => hit.el.addClass(c("reader-ink--erasing")));
        // A highlight under the eraser goes too (#747 FR-6), the way a scribble takes it.
        for (const box of erasing.marks.boxes) {
            const target = erasing.marks.targets.get(box.ref.id);
            if (target?.kind !== "highlight" || erasing.highlights.has(box.ref.id)) continue;
            const near = box.rects.some((r) => x >= r.left - reach && x <= r.left + r.width + reach && y >= r.top - reach && y <= r.top + r.height + reach);
            if (near) erasing.highlights.set(box.ref.id, target.thought);
        }
        erasing.last = [x, y];
    }

    /** The strokes within `reach` of a point of a surface — the ones written now and the kept ones — into `hits`. */
    private strokesAt(
        x: number,
        y: number,
        surface: Surface,
        hits: Set<LiveInk | KeptStroke>,
        reach: number,
        skip: readonly LiveInk[] = [],
        onHit?: (hit: LiveInk | KeptStroke) => void,
        /** A stroke's segments, measured once for a whole scribble rather than once per point. */
        cache?: Map<LiveInk | KeptStroke, Segment[]>
    ): void {
        const segmentsFor = (stroke: LiveInk | KeptStroke, make: () => Segment[]) => {
            if (!cache) return make();
            let found = cache.get(stroke);
            if (!found) cache.set(stroke, (found = make()));
            return found;
        };
        const hit = (segments: Segment[], sx: number, sy: number, scale: number) => segments.some((seg) => distanceToSegment(seg, sx, sy) <= reach / scale + seg.w / 2);
        for (const live of this.grouping.current()?.strokes ?? []) {
            if (live.surface.key !== surface.key || hits.has(live) || skip.includes(live)) continue;
            if (hit(segmentsFor(live, () => segmentsOf(live.stroke.points, live.pointerType).map((seg) => ({ ...seg, w: seg.w * live.surface.unit }))), x, y, 1)) {
                hits.add(live);
                onHit?.(live);
            }
        }
        for (const note of this.allNotes()) {
            if (note.state === "saving") continue;
            const local = this.inNote(note, x, y, surface);
            if (!local) continue;
            for (const kept of note.strokes) {
                if (hits.has(kept)) continue;
                if (hit(segmentsFor(kept, () => segmentsOf(kept.data.points, kept.data.pointerType)), local.x, local.y, local.scale)) {
                    hits.add(kept);
                    onHit?.(kept);
                }
            }
        }
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
        const highlights = [...erasing.highlights.values()];
        if (erasing.hits.size === 0 && highlights.length === 0) {
            this.status("reader_ink_nothing_erased");
            return;
        }
        this.eraseAll(erasing.hits, highlights, highlights.length > 0);
    }

    /**
     * Take strokes and highlights away as **one** action (#745 FR-7, #747 FR-5, FR-6): they fade
     * together, the writes follow in one recorded batch, and one undo brings all of it back. `say`: the
     * status line says *Erased*, with Undo — a scribble's, and an eraser's that took a highlight.
     */
    private eraseAll(hits: Set<LiveInk | KeptStroke>, highlights: Thought[], say: boolean): void {
        const lives = [...hits].filter((hit): hit is LiveInk => "stroke" in hit);
        const kept = [...hits].filter((hit): hit is KeptStroke => "data" in hit);
        for (const live of lives) {
            this.grouping.remove(live);
            this.fadeOut(live.el);
        }
        const byNote = new Map<KeptNote, KeptStroke[]>();
        for (const stroke of kept) {
            const note = this.allNotes().find((candidate) => candidate.strokes.includes(stroke));
            if (note) byNote.set(note, [...(byNote.get(note) ?? []), stroke]);
        }
        const engine = this.view.highlights?.() ?? null;
        const label = this.chapter?.notePath ?? "";
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
        let erased = lives.length;
        const work = withWriteBatch({ kind: "manual", ref: "reader-ink", label }, async () => {
            const notes = [...byNote].map(async ([note, strokes]) => {
                const before = note.strokes.map((s) => s.data);
                const wasKept = note.state === "kept";
                const thrown = await this.eraseFromNote(note, strokes, say ? "silent" : true);
                erased++;
                undos.push(() => this.bringBack(note, before, wasKept, thrown));
            });
            const marks = highlights.map(async (thought) => {
                if (!(await engine?.erase(thought))) return;
                erased++;
                undos.push(async () => {
                    // Undo draws the wash again, swept, as a mark is made: the words never fade.
                    const back = await engine?.unerase(thought);
                    back?.forEach((mark) => mark.addClass(c("reader-highlight--new")));
                });
            });
            await Promise.all([...notes, ...marks]);
        });
        const undo = async () => {
            await work;
            await withWriteBatch({ kind: "manual", ref: "reader-ink", label }, async () => {
                for (const run of undos) await run();
            });
        };
        const settle = this.pushStep(undo);
        void work.then(() => {
            // Nothing went (every write failed, and said so): no *Erased*, and no step to undo.
            if (erased === 0) settle();
            else if (say) this.say("reader_ink_erased", [{ key: "reader_hl_undo", run: () => void (settle() && undo()) }]);
        });
    }

    /**
     * Take strokes out of a note (FR-7): the drawing is written again, or — the last stroke gone —
     * the note goes to the trash with its drawing, with Undo (AC-9). Returns the trashed drawing.
     */
    private async eraseFromNote(note: KeptNote, strokes: KeptStroke[], quiet: boolean | "silent"): Promise<string | undefined> {
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
            // A gesture says *Erased* itself (#747); the eraser and an undo say the note went.
            if (quiet === false) this.status("reader_ink_removed", () => void this.restoreNote(note, thought, kept));
            else if (quiet === true) this.status("reader_ink_removed", () => void this.undo());
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

    private fadeOut(el: Element, duration: number = MOTION.fast): void {
        const host = el as unknown as HTMLElement;
        if (!motionWelcome(host)) {
            el.remove();
            return;
        }
        const animation = host.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: MOTION.ease, fill: "forwards" });
        this.fading.set(el, animation);
        // Gone at the end — unless an undo brought it back meanwhile (`fadeIn`).
        const gone = () => {
            if (this.fading.get(el) === animation) el.remove();
        };
        animation.onfinish = gone;
        ownWindow(host).setTimeout(gone, duration + 200);
    }

    private fadeIn<T extends SVGElement>(el: T): T {
        const host = el as unknown as HTMLElement;
        // Brought back while it was fading away: that fade, and its removal, are called off.
        const fading = this.fading.get(el);
        this.fading.delete(el);
        fading?.cancel?.();
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
        this.pageTexts.clear();
        this.pageMarks.clear();
    }
}

function round3(n: number): number {
    return Math.round(n * 1000) / 1000;
}

/** A fraction of a printed page as a CSS percentage. */
function pct(n: number): string {
    return `${Math.round(n * 100000) / 1000}%`;
}
