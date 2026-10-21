import { Component, setTooltip, type App } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { anchorAll, continuesSpan, quoteAt, type TextSpan } from "application/thinking/quoteAnchor";
import { isInk, type Thought, type ThoughtLocator, type ThoughtQuote } from "application/thinking/thought";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { activateSurface } from "architecture/plugin/services/ViewActivation";
import { chapterText, paragraphsAround, pointAt, textNodes, unwrapMark, wrapSpan } from "./readerMarks";
import { listingLanguage } from "./readerCode";
import { crystallizeHighlight } from "architecture/components/core/library/crystallizeHighlight";
import { DEFAULT_MEANING, HIGHLIGHT_MEANINGS, meaningOf, type HighlightMeaning } from "application/thinking/highlightMeaning";
import { MOTION, fly, motionWelcome } from "./readerMotion";
import { touchPointer } from "./readerDevice";
import { markHereOn } from "./readerHere";
import { printPageAt, type PageMark } from "application/library/provenance";
import { DEFAULT_LAYER, MARK_LAYERS, layerOf, type MarkLayer } from "application/thinking/markLayer";
import { MORE_ORDER, moreList, nextFocus, placePopover, secondRow, selectionSize, type PopoverAction } from "./readerPopoverLayout";

type LocaleKey = Parameters<typeof t>[0];

/** One action of the popover, as the way to draw its button into a row (#811). */
type Offer = (parent: HTMLElement) => HTMLElement;

/** The keys that walk the popover once focus is in it (#811 FR-12). */
const ARROWS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

/** The popover's gap from the words: the stylesheet's `--size-4-2`. */
const POPOVER_GAP_PX = 8;

/** A chapter line, when its own cannot be read: what the popover keeps clear above the words. */
const FALLBACK_LINE_PX = 24;

/** Numbers each popover's *More* region, so its toggle can name what it controls. */
let moreSeq = 0;

/** Where Think keeps highlights — the thought store, as far as the Reader uses it. */
export interface HighlightStore {
    folder(): string;
    highlightsAbout(notePath: string): Promise<Thought[]>;
    write(text: string, options: { about?: string; quote?: ThoughtQuote; locator?: ThoughtLocator; meaning?: HighlightMeaning; layer?: MarkLayer }): Promise<Thought | undefined>;
    save(thought: Thought): Promise<void>;
    /** An ink note's drawing goes with it, and comes back as the answer (#745 E7). */
    discard(thought: Thought): Promise<string | undefined | void>;
    restore(thought: Thought, drawing?: string): Promise<void>;
    /** Whether a thought is on disk as it was written (#810 FR-18): an undo is refused otherwise. */
    isAsWritten?(thought: Thought): Promise<boolean>;
}

/** What the current selection covers, in chapter-text offsets, and where it is on screen. */
export interface SelectionInfo {
    start: number;
    end: number;
    /** Where it is on screen; `height` places a popover below the words (#750). */
    rect: { left: number; top: number; width: number; height?: number };
    clear(): void;
}

/** The parts of the view the highlights draw into and act through. */
export interface HighlightView {
    app: App;
    /** Where the popover floats: the reader's root, positioned. */
    host: HTMLElement;
    /** What lives as long as the reader does. */
    owner: Component;
    /**
     * Bring an element of the chapter into view, inside the reader's own scroller — with `travel`, as
     * a camera move (#761). Returns how long until it has landed (ms), for a mark to wait for.
     */
    scrollTo(el: HTMLElement, travel?: boolean): number | void;
    /** Something changed that a panel might show. */
    onChange(): void;
    /** The layer new marks go to in this reading (#758 FR-4): reading until you choose another. */
    layerForNew?(): MarkLayer;
    /** The chapter's ink notes (#745 E9): from the same one read, handed to the ink layer. */
    onInk?(thoughts: Thought[]): void;
    /** The ink notes' rows, beside the highlights in the margin's list. */
    renderInk?(host: HTMLElement, scope: Component): void;
    /**
     * The moves of the popover's *Think* group, last in *More* (#756 FR-1, #811 FR-7) — *Contradict*,
     * *Connect*, and the AI's later (#759). Offered only in a book or a paper; the view decides.
     */
    thinkMoves?(): readonly ThinkMove[];
    /**
     * *Claim* and *Link to an idea* (#762 FR-1): in the second row when they fit the selection, in
     * *More* otherwise (#811). Offered only in a book or a paper, where a passage has a page.
     */
    passageActions?(): PassageActions | null;
    /**
     * *Look up* and *Translate* (#766 FR-1): first in the second row for one to three words, in *More*
     * otherwise (#811). What each selection is offered, and what each does; the view decides.
     */
    lookup?(): LookupActions | null;
    /**
     * *Snapshot this image* (#763 FR-2): a picture in a book, or a page of a paper drawn as its
     * picture, clicked. The view captures it; the popover only offers it.
     */
    snapshotImage?(el: HTMLElement, from: ScreenBox): void;
    /**
     * *Read aloud* (#765 FR-1), in the second row for a passage, in *More* otherwise (#811): the
     * selected words, read by the device's own voice. Absent where Listen is not offered.
     */
    readAloud?(): ((span: TextSpan) => void) | null;
    /**
     * *Cite* (#768 FR-1), in the selection popover — the second row for a sentence or a passage — and
     * in a highlight's *More*: the passage, cited from where the popover was. Absent with no source.
     */
    cite?(): ((passage: ThinkPassage, from: ScreenBox) => void) | null;
    /**
     * Offer a write's way back to the reading's undo ledger (#810 FR-15–FR-17): the run its Undo
     * button and Ctrl/⌘+Z share, guarded once. `check` refuses one changed since (FR-18).
     */
    undoable?(run: () => unknown, check?: () => Promise<boolean> | boolean): () => Promise<"undone" | "refused" | "spent">;
    /**
     * The visible page a popover may open into (#811 FR-14): its top, and where the Reader's bar
     * begins. Absent: the host's own box.
     */
    pageRoom?(): { top: number; bottom: number };
}

/** What the popover's *Look up* and *Translate* do (#766): offered per selection, run from its words. */
export interface LookupActions {
    offers(text: string): { lookUp: boolean; translate: boolean };
    lookUp(text: string, from: ScreenBox): Promise<void> | void;
    translate(text: string, from: ScreenBox): void;
}

/** A box on screen: where a gesture was asked from. */
export type ScreenBox = { left: number; top: number; width: number; height: number };

/** What the popover's *Claim* and *Link to an idea* do (#762): the view decides, the popover draws. */
export interface PassageActions {
    claim(passage: ThinkPassage, from: ScreenBox): void;
    /** Draw the picker into `container` (the popover), growing from `from`; `close` when it is done. */
    link(passage: ThinkPassage, container: HTMLElement, from: ScreenBox, close: () => void): void;
}

/** A passage a move works on (#756): its words, where it is, and the highlight it already is, if any. */
export interface ThinkPassage {
    quote: ThoughtQuote;
    locator: ThoughtLocator;
    highlight?: Thought;
}

/** One move of the *Think* row: its label, and what it does with the passage, from where it was asked. */
export interface ThinkMove {
    id: string;
    label: LocaleKey;
    run(passage: ThinkPassage, from: { left: number; top: number; width: number; height: number }): void;
}

/** Seams for tests; the defaults are the real DOM and the real thought store. */
export interface HighlightDeps {
    store?: HighlightStore;
    selection?: (body: HTMLElement) => SelectionInfo | null;
    headingAt?: (body: HTMLElement, offset: number) => string | undefined;
    makeMark?: (id: string) => HTMLElement;
    openThink?: (app: App, notePath: string) => void;
    copy?: (body: HTMLElement, text: string) => void;
    /** A source's highlight into a note (#683): the crystallize preview, never a write of its own. */
    toNote?: (app: App, thought: Thought, origin?: { left: number; top: number; width: number; height: number }) => void;
}

/** The name each meaning shows (#720). A literal map, so the locale guardrail sees every key. */
const MEANING_LABEL: Record<HighlightMeaning, LocaleKey> = {
    idea: "reader_hl_meaning_idea",
    question: "reader_hl_meaning_question",
    quote: "reader_hl_meaning_quote",
    discuss: "reader_hl_meaning_discuss",
};

/** The name each layer shows (#758): a literal map, so the locale guardrail sees every key. */
export const LAYER_LABEL: Record<MarkLayer, LocaleKey> = {
    reading: "reader_layer_reading",
    reflection: "reader_layer_reflection",
    research: "reader_layer_research",
};

/** What a stroke's highlight says it was kept as (#746 FR-7): the article differs per meaning (G2). */
const HIGHLIGHTED: Record<HighlightMeaning, LocaleKey> = {
    idea: "reader_ink_highlighted_idea",
    question: "reader_ink_highlighted_question",
    quote: "reader_ink_highlighted_quote",
    discuss: "reader_ink_highlighted_discuss",
};

/** Where a highlight came from (#746): it chooses the status line and the motion, and is never stored. */
export type HighlightOrigin = "selection" | "stroke";

/** One way back the status line offers. */
export interface StatusAction {
    key: LocaleKey;
    run: () => void;
    /** The thought an Undo takes back, as it was written: refused once it changed since (#810 FR-18). */
    thought?: Thought;
}

/** How a span is kept — the one engine's options (#746 FR-3). */
export interface KeepOptions {
    note?: string;
    meaning?: HighlightMeaning;
    origin?: HighlightOrigin;
    /** A stroke drawn right to left sweeps its mark from the right (FR-11). */
    direction?: "ltr" | "rtl";
    /** The ways back the status line offers for the thought kept; Undo when absent. */
    actions?: (thought: Thought) => StatusAction[];
    /** Called once the thought is written: a selection lets go of its words. */
    clear?: () => void;
}

/** The id a stroke's marks carry while their thought is being written (#746 FR-12). */
const PENDING_ID = "pending";

/**
 * A touch selection is offered once its handles have been still this long (#750 FR-5) — never while
 * they are dragged. Provisional: the device walk on issue #750 confirms or tunes it.
 */
export const SELECTION_SETTLE_MS = 350;

/** How far above the page's foot a stroke's status line sits: over the reader bar and the docked palette. */
const STROKE_STATUS_LIFT_PX = 200;

/** How long an answer (and its Undo) stays in the popover. */
const STATUS_MS = 8000;

function ownWindow(el: HTMLElement): Window | undefined {
    const win = (el as HTMLElement & { win?: Window }).win;
    if (win) return win;
    return typeof activeWindow === "undefined" ? undefined : activeWindow;
}

/**
 * Where a DOM point falls in the chapter's text — counted over the same text nodes the highlights
 * are drawn on (`textNodes`), so a diagram's styles or an open peek never shift an offset.
 */
function offsetOf(body: HTMLElement, node: Node, offset: number): number {
    const point = body.ownerDocument.createRange();
    point.setStart(node, offset);
    point.collapse(true);
    let at = 0;
    for (const text of textNodes(body) as unknown as Text[]) {
        if (text === node) return at + offset;
        // The whole text node ends at or before the point: it is all before it.
        if (point.comparePoint(text, text.data.length) <= 0) at += text.data.length;
        else break;
    }
    return at;
}

/** The selection inside `body`, measured against the chapter's text. Real DOM only. */
export function readSelection(body: HTMLElement): SelectionInfo | null {
    const selection = ownWindow(body)?.getSelection?.();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!body.contains(range.commonAncestorContainer)) return null;
    const start = offsetOf(body, range.startContainer, range.startOffset);
    const end = offsetOf(body, range.endContainer, range.endOffset);
    if (end <= start) return null;
    const rect = range.getBoundingClientRect();
    return {
        start,
        end,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        clear: () => selection.removeAllRanges(),
    };
}

/** The last heading at or before `offset` in the chapter — what the passage sat under. */
export function headingAt(body: HTMLElement, offset: number): string | undefined {
    let found: string | undefined;
    for (const heading of Array.from(body.querySelectorAll("h1, h2, h3, h4, h5, h6"))) {
        if (offsetOf(body, heading, 0) > offset) break;
        found = heading.textContent?.trim() || found;
    }
    return found;
}

/** A mark made in the chapter's own document — a pop-out window has its own. */
function newMarkIn(body: HTMLElement | null, id: string): HTMLElement {
    const options = { cls: c("reader-highlight"), attr: { "data-hl": id } };
    if (!body) return createEl("mark", options);
    const mark = body.createEl("mark", options);
    mark.remove(); // made in place for its document, then handed to wrapSpan unattached
    return mark;
}

function openInThink(app: App, notePath: string): void {
    void activateSurface(app, "zettelflow-home", "lab", { about: notePath });
}

function copyText(body: HTMLElement, text: string): void {
    void ownWindow(body)?.navigator?.clipboard?.writeText(text);
}

/** A note's name, as a row says it: no folder, no extension. */
function noteTitle(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/** A passage, short enough for a margin line. */
function snippet(text: string, max = 140): string {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * **Highlights and notes in the margin** (#671, epic #667) — Kindle-style, and they land in Think.
 *
 * Select words in a chapter and a small popover offers the four meanings, *Note*, *Copy* and *More*.
 * A highlight is a **thought** about the note, carrying the passage as a text-quote anchor; a note
 * is that thought's text. The note being read is never written: the highlight is found again, on
 * every visit, by looking for the same words (see `quoteAnchor`). One that cannot be found is
 * listed as detached, never dropped.
 *
 * Every keep, edit and removal is a write of a thought, recorded like every other write, and each
 * answer offers its Undo in place.
 */
export class ReaderHighlights {
    private readonly store: HighlightStore;
    /** What this reading made (#672): highlights kept, and how many carry a note. */
    private made = 0;
    private noted = 0;
    private readonly select: (body: HTMLElement) => SelectionInfo | null;
    private readonly heading: (body: HTMLElement, offset: number) => string | undefined;
    private readonly makeMark: (id: string) => HTMLElement;
    private readonly openThink: (app: App, notePath: string) => void;
    private readonly copy: (body: HTMLElement, text: string) => void;
    private readonly toNote: (app: App, thought: Thought) => void;

    private body: HTMLElement | null = null;
    private notePath: string | null = null;
    /** Where in a source the chapter on screen is (#681); absent for a note. */
    private locator: ThoughtLocator | null = null;
    /** The print pages of the chapter on screen (#751): a passage is cited on the page it starts on. */
    private pageMarks: readonly PageMark[] = [];
    /** Notes written in the margin of a page with no text (#681): a place, and no passage. */
    private pageNotes: Thought[] = [];
    private component: Component | null = null;
    private margin: HTMLElement | null = null;
    private anchored: { thought: Thought; marks: HTMLElement[] }[] = [];
    private detached: Thought[] = [];
    private popover: HTMLElement | null = null;
    /** Called when the popover on screen goes, whatever took it: the lasso's loop goes with it (#747). */
    private popoverClosed: (() => void) | null = null;
    /** Words offered by the lasso (#747 FR-7): a selection with no DOM selection behind it. */
    private offered: { selection: SelectionInfo; span: TextSpan; quote: ThoughtQuote } | null = null;
    /**
     * The passage a note is being written about, marked meanwhile: focusing the note box takes the
     * selection away, and the words lost their highlight while you typed. Gone with the popover.
     */
    private pending: HTMLElement[] = [];
    /**
     * Equations and drawings a highlight covers (#770), by thought id (`pending` for the one being
     * written): no mark goes inside one, so the whole equation or drawing is tinted instead.
     */
    private tints = new Map<string, HTMLElement[]>();
    /** The listeners of the popover on screen, gone with it. */
    private popoverScope: Component | null = null;
    /** The listeners of the margin's rows, replaced when it redraws. */
    private marginScope: Component | null = null;
    private statusTimer: number | undefined;
    /** The marks each extension added (#746 FR-5), so taking it back takes only them. */
    private readonly extensions = new Map<Thought, { marks: HTMLElement[]; tint: string }>();
    /** Numbers the tint keys of strokes and extensions in flight (#770): `stroke#3`, `<id>#4`. */
    private tintSeq = 0;
    /** The detached highlight being re-anchored (#810 FR-9): its passage is the next one you select. */
    private reanchoring: Thought | null = null;
    /** The state's line, above the page: what is being re-anchored, and *Cancel*. */
    private reanchorLine: HTMLElement | null = null;
    /** The highlight a selection kept last in this reading (#868): the next words may continue it. */
    private lastKept: string | null = null;
    /** The meaning you chose last (#720): what H keeps and what *Note* uses. */
    private lastMeaning: HighlightMeaning = DEFAULT_MEANING;
    /** The margin shows one meaning only, when you asked it to (#720). */
    private filter: HighlightMeaning | null = null;
    /** Bumped on every chapter, so a slow load never draws over a newer one. */
    private generation = 0;
    /**
     * The last pointer that touched the page (#750): a finger or a pen selects beside iPadOS's own
     * callout, which has its own Copy; a mouse selects as it always has.
     */
    private pointer = "mouse";

    constructor(
        private readonly view: HighlightView,
        deps: HighlightDeps = {}
    ) {
        this.store = deps.store ?? ThoughtStore.getInstance();
        this.select = deps.selection ?? readSelection;
        this.heading = deps.headingAt ?? headingAt;
        this.makeMark = deps.makeMark ?? ((id) => newMarkIn(this.body, id));
        this.openThink = deps.openThink ?? openInThink;
        this.copy = deps.copy ?? copyText;
        this.toNote = deps.toNote ?? ((app, thought) => crystallizeHighlight(app, thought));
    }

    /** The chapter's highlights, drawn and anchored in reading order. */
    /** Highlights and margin notes made since the reading opened — what its end card counts. */
    sessionCounts(): { highlights: number; notes: number } {
        return { highlights: this.made, notes: this.noted };
    }

    items(): Thought[] {
        return this.anchored.map((entry) => entry.thought);
    }

    /** Every mark of the chapter on screen (#758): the highlights, the detached ones, the page notes. */
    allMarks(): Thought[] {
        return [...this.anchored.map((entry) => entry.thought), ...this.detached, ...this.pageNotes];
    }

    /** The equations and drawings highlight `id` tints whole (#770): what its ink is, besides its marks. */
    tintsFor(id: string): HTMLElement[] {
        return this.tintsOf(id);
    }

    detachedItems(): Thought[] {
        return [...this.detached];
    }

    hasPopover(): boolean {
        return this.popover !== null;
    }

    /**
     * Take over a freshly rendered chapter: draw the note's highlights over it and listen for a
     * selection. `component` is the chapter's own, so its listeners go with the chapter.
     */
    async attach(
        body: HTMLElement,
        notePath: string,
        component: Component,
        margin: HTMLElement | null,
        /** The chapter's place, when it is a page of a PDF or a chapter of an EPUB (#681). */
        locator: ThoughtLocator | null = null,
        /** Where the print pages the book declares begin in this chapter's text (#751 FR-3). */
        pageMarks: readonly PageMark[] = []
    ): Promise<void> {
        const generation = ++this.generation;
        this.hidePopover();
        this.body = body;
        this.notePath = notePath;
        this.locator = locator;
        this.pageMarks = pageMarks;
        this.pageNotes = [];
        this.component = component;
        this.margin = margin;
        this.lastKept = null;
        this.anchored = [];
        this.tints.clear();
        this.detached = [];
        this.renderMargin();

        // The words can be selected at all only because reader.scss gives the body back the
        // `user-select: text` Obsidian's `body { user-select: none }` takes away (#667).
        component.registerDomEvent(body, "mouseup", () => this.onSelect());
        // A picture in a book, or a page drawn as its picture, offers itself as a snapshot (#763 FR-2).
        if (locator && this.view.snapshotImage) component.registerDomEvent(body, "click", (event: MouseEvent) => this.offerImage(event));
        component.registerDomEvent(body, "keyup", (event: KeyboardEvent) => {
            if (event.shiftKey) this.onSelect();
        });
        const doc = body.ownerDocument as Document | undefined;
        if (doc) {
            // A drag that starts in the chapter often ends past it — in the margin, below the last
            // line: that mouseup lands on the document, and must still offer the popover. One that
            // lands inside the popover is a click on its buttons, never a new selection.
            let pressed = false;
            component.registerDomEvent(doc, "pointerdown", (event: PointerEvent) => (this.pointer = event.pointerType || "mouse"), { capture: true });
            component.registerDomEvent(doc, "mousedown", () => (pressed = true), { capture: true });
            component.registerDomEvent(doc, "mouseup", (event: MouseEvent) => {
                pressed = false;
                const target = event.target as Node | null;
                if (this.body !== body || (target && (body.contains(target) || this.popover?.contains(target)))) return;
                this.onSelect();
            });
            // A touch selection (long-press, drag handles) ends with no mouseup at all: the
            // document's selectionchange, settled, so highlights work on a phone. Never mid-drag.
            let settle: number | undefined;
            component.registerDomEvent(doc, "selectionchange", () => {
                window.clearTimeout(settle);
                settle = window.setTimeout(() => {
                    if (this.body === body && !pressed) this.onSelect();
                }, SELECTION_SETTLE_MS);
            });
            component.register(() => window.clearTimeout(settle));
        }

        let thoughts: Thought[] = [];
        try {
            thoughts = await this.store.highlightsAbout(notePath);
        } catch (error) {
            log.warn(`[Reader] could not read the highlights of ${notePath}: ${String(error)}`);
        }
        if (generation !== this.generation || this.body !== body) return;
        // A source's passages are found again only on their own page or chapter (#681).
        const inChapter = thoughts.filter((thought) => (locator ? thought.locator?.at === locator.at : !thought.locator));
        // Ink is drawn by the ink layer and listed beside the highlights, never anchored as one (#745 E9).
        // A Reader move's answer (#756) carries its passage, but is not a mark: never drawn as one.
        const here = inChapter.filter((thought) => !isInk(thought) && !thought.madeBy);
        this.view.onInk?.(inChapter.filter(isInk));
        this.pageNotes = here.filter((thought) => !thought.quote?.exact && thought.text.trim());
        const text = chapterText(body);
        const { anchored, detached } = anchorAll(
            text,
            here.filter((thought) => thought.quote).map((thought) => ({ thought, quote: thought.quote! }))
        );
        // Last first: drawing a later passage never moves the offsets of an earlier one.
        for (const entry of [...anchored].sort((a, b) => b.span.start - a.span.start)) {
            this.anchored.push({ thought: entry.thought, marks: this.draw(entry.thought, entry.span) });
        }
        this.anchored.reverse();
        this.detached = detached.map((entry) => entry.thought);
        this.renderMargin();
        this.view.onChange();
    }

    /** A chapter is about to render: nothing of the last one may show meanwhile. */
    reset(): void {
        this.generation++;
        this.hidePopover();
        this.body = null;
        this.notePath = null;
        this.locator = null;
        this.pageMarks = [];
        this.pageNotes = [];
        this.lastKept = null;
        this.anchored = [];
        this.tints.clear();
        this.detached = [];
        this.renderMargin();
    }

    /** The reader is closing. */
    dispose(): void {
        this.cancelReanchor();
        this.hidePopover();
        this.marginScope?.unload();
        this.marginScope = null;
    }

    /** The page scrolled: a popover over a selection or a mark goes with what it pointed at. */
    onScroll(): void {
        if (this.popover && !this.popover.hasClass(c("reader-hl-pop--editing"))) this.hidePopover();
    }

    /**
     * Go to a highlight a deep link asked for, and show it is there: the *you are here* mark (#761
     * FR-17), once the move has landed. `travel`: its chapter is the one on screen, so the camera moves
     * there (§XVI) instead of landing at once.
     */
    reveal(id: string, travel = false): boolean {
        const entry = this.anchored.find((candidate) => candidate.thought.id === id);
        // An embed that re-rendered drops the marks drawn in it: only a live one can be shown.
        const mark = entry?.marks.find((m) => m.isConnected !== false);
        if (!entry || !mark) return false;
        const landed = this.view.scrollTo(mark, travel);
        markHereOn(
            entry.marks.filter((m) => m.isConnected !== false),
            typeof landed === "number" ? landed : 0
        );
        return true;
    }

    /** H: highlight what is selected now. Returns whether there was anything to keep. */
    highlightCurrent(withNote = false, meaning: HighlightMeaning = this.lastMeaning): boolean {
        const found = this.currentQuote();
        if (!found) return false;
        if (withNote) this.openNoteEditor(found.selection, found.span, found.quote, meaning);
        else void this.keep(found.selection, found.span, found.quote, "", meaning);
        return true;
    }

    /** 1–4 while words are selected: keep them with that meaning (#720). */
    chooseMeaning(index: number): boolean {
        const meaning = HIGHLIGHT_MEANINGS[index];
        if (!meaning || !this.popover?.hasClass(c("reader-hl-pop--select"))) return false;
        return this.highlightCurrent(false, meaning);
    }

    hidePopover(): void {
        this.offered = null;
        const closed = this.popoverClosed;
        this.popoverClosed = null;
        closed?.();
        this.clearPending();
        ownWindow(this.view.host)?.clearTimeout(this.statusTimer);
        this.popover?.remove();
        this.popover = null;
        this.popoverScope?.unload();
        this.popoverScope = null;
    }

    /**
     * A note in the margin of this page, with no passage (#681): what a scanned PDF still allows.
     * The note form opens over `anchor`; Ctrl/Cmd-Enter keeps it as a thought in Think.
     */
    notePage(anchor: HTMLElement): void {
        if (!this.notePath || !this.locator) return;
        const rect = anchor.getBoundingClientRect();
        const pop = this.openPopover({ left: rect.left, top: rect.top + rect.height, width: rect.width }, "editing");
        this.noteForm(pop, "", (text) => void this.keepPageNote(text));
    }

    /**
     * A note on this page kept elsewhere — a snapshot's fleeting note (#763 FR-5.2): listed under
     * *Notes on this page* at once. Its row in the margin, for the picture to land in.
     */
    addPageNote(thought: Thought): HTMLElement | null {
        if (!this.locator || thought.locator?.at !== this.locator.at) return null;
        this.pageNotes.push(thought);
        this.noted++;
        this.renderMargin();
        this.view.onChange();
        return this.margin?.querySelector<HTMLElement>(`[data-note="${thought.id}"]`) ?? null;
    }

    /** That note taken back (its Undo): gone from the list. */
    removePageNote(id: string): void {
        const before = this.pageNotes.length;
        this.pageNotes = this.pageNotes.filter((thought) => thought.id !== id);
        if (this.pageNotes.length === before) return;
        this.noted = Math.max(0, this.noted - 1);
        this.renderMargin();
        this.view.onChange();
    }

    /** The picture a note is, when its text is one embedded image: `![[x.png]]` or `![](x.png)`. */
    private embeddedImage(thought: Thought): string | null {
        const text = thought.text.trim();
        const link = /^!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/.exec(text)?.[1] ?? /^!\[[^\]]*\]\(<?([^)>]+)>?\)$/.exec(text)?.[1];
        if (!link || !/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(link)) return null;
        const app = this.view.app;
        try {
            const file = app.metadataCache?.getFirstLinkpathDest?.(decodeURI(link.trim()), thought.about ?? "");
            return file ? (app.vault.getResourcePath?.(file) ?? null) : null;
        } catch {
            return null;
        }
    }

    /** A click on a picture (FR-2): the popover offers *Snapshot this image*, and nothing else. */
    private offerImage(event: MouseEvent): void {
        const target = event.target as { closest?: (s: string) => HTMLElement | null } | null;
        const el = target?.closest?.("img, canvas") ?? null;
        const picture = el && (el.getAttribute("data-zf-src") || el.classList.contains(c("reader-page-picture")));
        if (!el || !picture || !this.view.snapshotImage || this.currentQuote()) return;
        const r = el.getBoundingClientRect();
        const from: ScreenBox = { left: r.left, top: r.top, width: r.width, height: r.height };
        const pop = this.openPopover({ left: event.clientX, top: event.clientY, width: 0, height: 0 }, "mark", true);
        const actions = pop.createDiv({ cls: c("reader-hl-actions") });
        this.button(actions, "reader_snapshot_image", true, () => {
            this.hidePopover();
            this.view.snapshotImage?.(el, from);
        });
    }

    /** Draw the margin's list again: an ink note was kept or taken away (#745). */
    refreshMargin(): void {
        this.renderMargin();
        this.view.onChange();
    }

    /** The highlights as a list — the margin's content, and the context panel's on a narrow pane. */
    renderList(host: HTMLElement, scope: Component): void {
        this.renderHighlightList(host, scope);
        this.view.renderInk?.(host, scope);
    }

    private renderHighlightList(host: HTMLElement, scope: Component): void {
        if (this.pageNotes.length > 0) {
            host.createDiv({ cls: c("reader-hl-heading"), text: t("reader_hl_page_notes") });
            for (const thought of this.pageNotes) {
                const row = host.createDiv({ cls: [c("reader-hl-item"), c("reader-hl-item--page")], attr: { "data-note": thought.id } });
                // A snapshot kept as a fleeting note (#763): its picture, not its embed's text.
                const picture = this.embeddedImage(thought);
                if (picture) row.createEl("img", { cls: c("reader-hl-snapshot"), attr: { src: picture, alt: "" } });
                else row.createDiv({ cls: c("reader-hl-note"), text: thought.text.trim() });
            }
        }
        if (this.anchored.length === 0 && this.detached.length === 0) return;
        host.createDiv({ cls: c("reader-hl-heading"), text: t("reader_hl_margin") });
        this.renderFilter(host, scope);
        for (const entry of this.anchored) {
            const meaning = meaningOf(entry.thought);
            if (this.filter && meaning !== this.filter) continue;
            const row = host.createEl("button", { cls: [c("reader-hl-item"), c(`reader-hl-item--${meaning}`)], attr: { type: "button", "data-hl": entry.thought.id } });
            row.createDiv({ cls: c("reader-hl-quote"), text: snippet(entry.thought.quote?.exact ?? "") });
            if (entry.thought.text.trim()) row.createDiv({ cls: c("reader-hl-note"), text: entry.thought.text.trim() });
            // What it became (#762 FR-5): the claim it is the passage of.
            for (const claim of entry.thought.claims ?? []) row.createDiv({ cls: c("reader-hl-claim"), text: t("reader_from_claim", noteTitle(claim)) });
            scope.registerDomEvent(row, "click", () => this.reveal(entry.thought.id));
        }
        if (this.detached.length === 0) return;
        host.createDiv({ cls: c("reader-hl-heading"), text: t("reader_hl_detached") });
        for (const thought of this.detached) {
            const row = host.createDiv({ cls: [c("reader-hl-item"), c("reader-hl-item--detached")], attr: { "data-hl": thought.id } });
            row.createDiv({ cls: c("reader-hl-quote"), text: snippet(thought.quote?.exact ?? "") });
            if (thought.text.trim()) row.createDiv({ cls: c("reader-hl-note"), text: thought.text.trim() });
            const open = row.createEl("button", {
                cls: c("reader-hl-link"),
                text: t("reader_hl_open_think"),
                attr: { type: "button" },
            });
            scope.registerDomEvent(open, "click", () => this.openThink(this.view.app, thought.about ?? ""));
            // Put it back on the page (#810 FR-8): the passage you select next is its passage.
            const reanchor = row.createEl("button", { cls: c("reader-hl-link"), text: t("reader_hl_reanchor"), attr: { type: "button", "data-zf-reanchor": "" } });
            scope.registerDomEvent(reanchor, "click", () => this.startReanchor(thought));
            if (this.reanchoring?.id === thought.id) row.addClass(c("reader-hl-item--reanchoring"));
        }
    }

    // ── re-anchor a detached highlight (#810 FR-8–FR-14) ─────────────────────

    /** Whether the Reader is waiting for the passage a detached highlight belongs to. */
    isReanchoring(): boolean {
        return this.reanchoring !== null;
    }

    /**
     * *Re-anchor* (FR-9): a calm mode. A line names the highlight and offers *Cancel*; the page does
     * not move, and the whole book stays reachable to find the passage. Nothing is written yet.
     */
    startReanchor(thought: Thought): void {
        this.cancelReanchor();
        this.reanchoring = thought;
        const line = this.view.host.createDiv({ cls: c("reader-reanchor"), attr: { role: "status", "aria-live": "polite" } });
        line.createSpan({ cls: c("reader-reanchor-text"), text: t("reader_hl_reanchor_state", snippet(thought.quote?.exact ?? "", 60)) });
        const cancel = line.createEl("button", { cls: c("reader-hl-action"), text: t("reader_hl_cancel"), attr: { type: "button" } });
        this.view.owner.registerDomEvent(cancel, "click", () => this.cancelReanchor());
        this.reanchorLine = line;
        this.hidePopover();
        this.renderMargin();
    }

    /** Leave the state (FR-12): Esc, *Cancel*, another book, the Reader closed. Nothing is written. */
    cancelReanchor(): void {
        if (!this.reanchoring && !this.reanchorLine) return;
        this.reanchoring = null;
        this.reanchorLine?.remove();
        this.reanchorLine = null;
        if (this.popover?.hasClass(c("reader-hl-pop--anchor"))) this.hidePopover();
        this.renderMargin();
    }

    /** The one offer a selection gets while re-anchoring (FR-10): *Anchor here*. */
    private offerAnchor(found: { selection: SelectionInfo; span: TextSpan; quote: ThoughtQuote }, touch: boolean): void {
        if (!found.quote.exact.trim()) {
            this.say("reader_hl_reanchor_words");
            return;
        }
        const pop = this.openPopover(found.selection.rect, "select", touch);
        pop.addClass(c("reader-hl-pop--anchor"));
        this.button(pop, "reader_hl_anchor_here", true, () => void this.anchorHere(found));
    }

    /**
     * *Anchor here* (FR-10, FR-11): the same thought (its id, note, meaning, layer, claims and review)
     * given the new passage and place, in one recorded write. The wash settles into the passage, the
     * row leaves *Detached*, and the line offers Undo.
     */
    private async anchorHere(found: { selection: SelectionInfo; span: TextSpan; quote: ThoughtQuote }): Promise<void> {
        const before = this.reanchoring;
        const body = this.body;
        if (!before || !body) return;
        const locator = this.placedAt(found.span.start);
        const quote = locator && !found.quote.heading && locator.label ? { ...found.quote, heading: locator.label } : found.quote;
        const next: Thought = { ...before, quote };
        if (locator) next.locator = locator;
        else delete next.locator;
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-highlight", label: before.about ?? "" }, () => this.store.save(next));
        } catch (error) {
            log.error(`[Reader] could not re-anchor a highlight: ${String(error)}`);
            this.status("reader_hl_failed");
            return;
        }
        found.selection.clear();
        this.reanchoring = null;
        this.reanchorLine?.remove();
        this.reanchorLine = null;
        this.detached = this.detached.filter((candidate) => candidate.id !== before.id);
        if (this.body === body) {
            const marks = this.draw(next, found.span);
            marks.forEach((mark) => mark.addClass(c("reader-highlight--new")));
            this.insert(next, marks, found.span.start);
            this.settleIntoMargin(marks[0], next);
        }
        this.renderMargin();
        this.view.onChange();
        this.status("reader_hl_reanchored", [{ key: "reader_hl_undo", run: () => void this.unanchor(before, next), thought: next }]);
    }

    /** Undo of a re-anchor (FR-11, MF-3): the old passage and place again, detached where it was. */
    private async unanchor(before: Thought, after: Thought): Promise<void> {
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-highlight", label: before.about ?? "" }, () => this.store.save(before));
        } catch (error) {
            log.error(`[Reader] could not take a re-anchor back: ${String(error)}`);
            this.status("reader_hl_failed");
            return;
        }
        const entry = this.anchored.find((candidate) => candidate.thought.id === after.id);
        this.fadeMarks(entry?.marks ?? []);
        this.untint(after.id);
        this.anchored = this.anchored.filter((candidate) => candidate.thought.id !== after.id);
        // Listed where it was: under *Detached* of its own chapter, when that is the one on screen.
        const here = this.locator ? before.locator?.at === this.locator.at : !before.locator;
        if (here && !this.detached.some((candidate) => candidate.id === before.id)) this.detached.push(before);
        this.renderMargin();
        this.view.onChange();
        this.hideStatus();
    }

    /** The book was renamed (#810): the chapter on screen is about its new path from now. */
    repath(from: string, to: string): void {
        if (this.notePath === from) this.notePath = to;
        const swap = (thought: Thought): Thought => (thought.about === from ? { ...thought, about: to } : thought);
        this.anchored = this.anchored.map((entry) => ({ ...entry, thought: swap(entry.thought) }));
        this.detached = this.detached.map(swap);
        this.pageNotes = this.pageNotes.map(swap);
        if (this.reanchoring) this.reanchoring = swap(this.reanchoring);
    }

    // ── one engine (#746 FR-3): a selection and a stroke keep words the same way ─

    /** The meaning H keeps (#720): the one chosen last, an idea at first. */
    currentMeaning(): HighlightMeaning {
        return this.lastMeaning;
    }

    /** Whether a chapter with text is attached: a stroke has words to keep. */
    hasText(): boolean {
        return this.body !== null && this.notePath !== null;
    }

    /** The quote for a span of the chapter's text, with the heading it sits under. */
    quoteFor(start: number, end: number): { span: TextSpan; quote: ThoughtQuote } | null {
        const body = this.body;
        if (!body) return null;
        const text = chapterText(body);
        const made = quoteAt(text, start, end);
        if (!made) return null;
        const heading = this.heading(body, made.span.start);
        // Code only when the passage begins and ends in the same listing: a span into the prose is prose.
        const code = this.codeAt(body, made.span.start, made.span.end);
        if (!code) return { span: made.span, quote: { ...made.quote, ...(heading ? { heading } : {}) } };
        // Kept from a listing (#824 FR-8): its first line keeps its indentation, and the quote says it is
        // code. Back over the indent only when the selection began at it — never into a line's middle.
        let from = made.span.start;
        let back = from;
        while (back > 0 && (text[back - 1] === " " || text[back - 1] === "\t")) back--;
        if (back === 0 || text[back - 1] === "\n") from = back;
        const span = { start: from, end: made.span.end };
        const prefix = text.slice(Math.max(0, from - made.quote.prefix.length), from);
        return { span, quote: { exact: text.slice(from, span.end), prefix, suffix: made.quote.suffix, ...(heading ? { heading } : {}), code } };
    }

    /** The listing of code a place in the chapter is in, as the quote records it — or none (#824). */
    private codeAt(body: HTMLElement, start: number, end: number): { language?: string } | null {
        const listingAt = (offset: number) => {
            const at = pointAt(body, offset);
            const parent = (at?.node as unknown as { parentNode?: Element | null } | undefined)?.parentNode ?? null;
            return parent?.closest?.(`pre.${c("reader-code")}`) ?? null;
        };
        const pre = listingAt(start);
        if (!pre || listingAt(Math.max(start, end - 1)) !== pre) return null;
        const language = listingLanguage(pre);
        return language ? { language } : {};
    }

    private currentQuote(): { selection: SelectionInfo; span: TextSpan; quote: ThoughtQuote } | null {
        const body = this.body;
        if (!body) return null;
        const selection = this.select(body);
        // The lasso's words are a selection too, while their popover is up (#747 FR-7).
        if (!selection) return this.offered;
        const found = this.quoteFor(selection.start, selection.end);
        return found ? { selection, ...found } : null;
    }

    private onSelect(): void {
        // A popover that is asking for a note keeps its place while you reach for the keyboard.
        if (this.popover?.hasClass(c("reader-hl-pop--editing"))) return;
        const found = this.currentQuote();
        if (!found) {
            if (this.popover?.hasClass(c("reader-hl-pop--select"))) this.hidePopover();
            // Re-anchoring, words that cannot be a highlight (#810 FR-13): a quiet line asks for words.
            const body = this.body;
            if (this.reanchoring && body && this.select(body)) this.say("reader_hl_reanchor_words");
            return;
        }
        // A touch selection: below the words, beside the system's callout above them (FR-5).
        this.offerSelection(found, touchPointer({ pointerType: this.pointer }));
    }

    /**
     * The lasso's words (#747 FR-7): the **same** popover a selection opens — the four meanings,
     * *Note*, *Copy*, *More* — for exactly those words. It writes nothing by itself; `onClose` is
     * called when the popover goes, whatever took it (a choice, Esc, a scroll, another popover).
     */
    offerSpan(span: TextSpan, rect: SelectionInfo["rect"], onClose?: () => void): boolean {
        const found = this.quoteFor(span.start, span.end);
        if (!found || !this.body) return false;
        const selection: SelectionInfo = { start: found.span.start, end: found.span.end, rect, clear: () => undefined };
        // Below the loop, as a touch selection's: the hand that drew it is above it. No system callout
        // offers Copy here, so the popover does.
        this.offerSelection({ selection, ...found }, true, false);
        this.offered = { selection, ...found };
        this.popoverClosed = onClose ?? null;
        return true;
    }

    /**
     * Words selected on a printed page in Page view (#842): the same first row a selection gets — the
     * four meanings as dots, *Note*, *Copy* — kept through `keep`, the page's own write. Nothing is
     * written until you choose; `onClose` when the popover goes, whatever took it.
     */
    offerPassage(text: string, rect: SelectionInfo["rect"], keep: (meaning: HighlightMeaning, note: string) => void, onClose?: () => void): void {
        const pop = this.openPopover(rect, "select", true);
        const row = pop.createDiv({ cls: [c("reader-hl-row"), c("reader-hl-first")] });
        const dots = row.createDiv({ cls: c("reader-hl-meanings") });
        for (const meaning of HIGHLIGHT_MEANINGS) {
            this.meaningButton(dots, meaning, meaning === this.lastMeaning, () => {
                this.hidePopover();
                keep(meaning, "");
            });
        }
        this.button(row, "reader_hl_note", true, () => {
            const meaning = this.lastMeaning;
            const editor = this.openPopover(rect, "editing", true);
            this.noteForm(editor, "", (note) => {
                this.hidePopover();
                keep(meaning, note.trim());
            });
            this.place(editor, rect, true);
        });
        this.button(row, "reader_hl_copy", false, () => {
            this.copy(this.view.host, text);
            this.status("reader_hl_copied");
        });
        this.place(pop, rect, true);
        this.popoverClosed = onClose ?? null;
    }

    /**
     * The selection popover over `found` (#720, #750, #811): a first row that is always the same — the
     * four meanings as dots, *Note*, *Copy*, *More* — a second row with what fits this much text, and
     * everything else behind *More*, in one order.
     */
    private offerSelection(found: { selection: SelectionInfo; span: TextSpan; quote: ThoughtQuote }, touch: boolean, systemCopy = touch): void {
        // Re-anchoring (#810 FR-10): the words are offered one thing only, never the popover.
        if (this.reanchoring) {
            this.offerAnchor(found, touch);
            return;
        }
        const pop = this.openPopover(found.selection.rect, "select", touch);
        const locator = this.placedAt(found.span.start);
        const passage = locator ? { quote: found.quote, locator } : null;
        const offers = this.passageOffers(passage, found.selection.rect, () => found.selection.clear(), {
            text: found.quote.exact,
            selection: found.selection,
            span: found.span,
        });
        const shown = secondRow(selectionSize(found.quote.exact, this.bodyLanguage()), new Set(offers.keys()));
        this.renderRows(pop, {
            first: (row) => {
                // Four meanings, chosen as you mark (#720): the passage takes that colour at once.
                const dots = row.createDiv({ cls: c("reader-hl-meanings") });
                for (const meaning of HIGHLIGHT_MEANINGS) {
                    this.meaningButton(dots, meaning, meaning === this.lastMeaning, () => void this.keep(found.selection, found.span, found.quote, "", meaning));
                }
                this.button(row, "reader_hl_note", true, () => this.openNoteEditor(found.selection, found.span, found.quote, this.lastMeaning));
                // The system's callout already offers Copy to a finger (FR-6); a mouse — and a lasso — only ours.
                if (!systemCopy) {
                    this.button(row, "reader_hl_copy", false, () => {
                        if (this.body) this.copy(this.body, found.quote.exact);
                        this.status("reader_hl_copied");
                    });
                }
            },
            second: shown.map((id) => offers.get(id)!),
            more: moreList(MORE_ORDER, new Set(offers.keys()), shown).map((id) => offers.get(id)!),
            think: passage,
        });
        this.place(pop, found.selection.rect, touch);
    }

    /**
     * What a passage is offered besides its meanings (#811 FR-5): each action, by its id, as the way to
     * draw its button — only those available here, under exactly today's conditions. A click does
     * exactly what it did from the old rows (FR-10).
     */
    private passageOffers(
        passage: ThinkPassage | null,
        rect: SelectionInfo["rect"],
        clear: (() => void) | undefined,
        words: { text: string; selection: SelectionInfo; span: TextSpan } | null
    ): Map<PopoverAction, Offer> {
        const offers = new Map<PopoverAction, Offer>();
        const from: ScreenBox = { left: rect.left, top: rect.top, width: rect.width, height: rect.height ?? 0 };
        // *Claim* and *Link to an idea* (#762 FR-1): *Claim* takes the popover away and opens the sheet
        // from the words; *Link* turns the popover into the picker, growing from the button (FR-14).
        const gestures = passage ? this.view.passageActions?.() : null;
        if (passage && gestures) {
            offers.set("claim", (parent) => {
                const button = this.button(parent, "reader_hl_claim", false, () => {
                    this.hidePopover();
                    gestures.claim(passage, from);
                    clear?.();
                });
                button.setAttribute("data-zf-claim", "");
                return button;
            });
            offers.set("link", (parent) => {
                const link = this.button(parent, "reader_hl_link_idea", false, () => {
                    const r = link.getBoundingClientRect();
                    const pop = this.openPopover(rect, "editing");
                    pop.addClass(c("reader-hl-pop--picker"));
                    gestures.link(passage, pop, { left: r.left, top: r.top, width: r.width, height: r.height }, () => {
                        if (this.popover === pop) this.hidePopover();
                    });
                });
                link.setAttribute("data-zf-link", "");
                return link;
            });
        }
        // *Cite* (#768 FR-1, FR-10): the popover goes, and the cite panel grows from where it was — the
        // page does not move. It writes nothing; the panel copies only when you press its *Copy*.
        const cite = passage ? this.view.cite?.() : null;
        if (passage && cite) {
            offers.set("cite", (parent) => {
                const button = this.button(parent, "reader_cite", false, () => {
                    const r = (this.popover ?? parent).getBoundingClientRect();
                    this.hidePopover();
                    cite(passage, { left: r.left, top: r.top, width: r.width, height: r.height });
                    clear?.();
                });
                button.setAttribute("data-zf-cite", "");
                return button;
            });
        }
        if (!words) return offers;
        // *Look up* for one to three words, *Translate* where an honest path exists (#766 FR-1, FR-9).
        // The card grows from the words; the words are let go, or a click on the card offers them again.
        const lookup = this.view.lookup?.();
        const offer = lookup?.offers(words.text);
        if (lookup && offer?.lookUp) {
            offers.set("look-up", (parent) => {
                const button = this.button(parent, "reader_hl_lookup", false, () => {
                    this.hidePopover();
                    void Promise.resolve(lookup.lookUp(words.text, from)).catch((error: unknown) => log.warn(`[Reader] a look-up failed: ${error instanceof Error ? error.name : "error"}`));
                    words.selection.clear();
                });
                button.setAttribute("data-zf-lookup", "");
                return button;
            });
        }
        if (lookup && offer?.translate) {
            offers.set("translate", (parent) => {
                const button = this.button(parent, "reader_hl_translate", false, () => {
                    this.hidePopover();
                    lookup.translate(words.text, from);
                    words.selection.clear();
                });
                button.setAttribute("data-zf-translate", "");
                return button;
            });
        }
        // *Read aloud* (#765 FR-1): the selected words, by the device's own voice.
        const aloud = this.view.readAloud?.();
        if (aloud) {
            offers.set("read-aloud", (parent) => {
                const button = this.button(parent, "reader_listen_selection", false, () => {
                    this.hidePopover();
                    words.selection.clear();
                    aloud(words.span);
                });
                button.setAttribute("data-zf-listen", "");
                return button;
            });
        }
        return offers;
    }

    /**
     * The popover's rows (#811): the first, always the same; the second, what fits; then *More* — a
     * region that grows in place, hidden until asked for, holding the rest in one order and, last, the
     * *Think* moves. *More* is offered only when it has something to show.
     */
    private renderRows(pop: HTMLElement, rows: { first: (row: HTMLElement) => void; second: readonly Offer[]; fixedSecond?: (row: HTMLElement) => void; more: readonly Offer[]; think: ThinkPassage | null }): void {
        const first = pop.createDiv({ cls: [c("reader-hl-row"), c("reader-hl-first")] });
        rows.first(first);
        if (rows.second.length > 0 || rows.fixedSecond) {
            const second = pop.createDiv({ cls: [c("reader-hl-row"), c("reader-hl-actions"), c("reader-hl-second")] });
            for (const draw of rows.second) draw(second);
            rows.fixedSecond?.(second);
        }
        const moves = rows.think ? (this.view.thinkMoves?.() ?? []) : [];
        if (rows.more.length === 0 && moves.length === 0) return;
        const id = `zf-hl-more-${++moreSeq}`;
        const toggle = this.button(first, "reader_hl_more", false, () => this.setMore(!pop.hasClass("is-expanded")));
        toggle.addClass(c("reader-hl-more-toggle"));
        toggle.setAttribute("aria-label", t("reader_hl_more_label"));
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-controls", id);
        const region = pop.createDiv({ cls: c("reader-hl-more"), attr: { id, hidden: "" } });
        if (rows.more.length > 0) {
            const list = region.createDiv({ cls: [c("reader-hl-row"), c("reader-hl-actions"), c("reader-hl-more-list")] });
            for (const draw of rows.more) draw(list);
        }
        if (rows.think && moves.length > 0) this.thinkGroup(region, rows.think, moves);
    }

    /** *More*, opened or folded (#811 FR-9): in place, nothing written, nothing sent. */
    private setMore(open: boolean): void {
        const pop = this.popover;
        const region = pop?.querySelector<HTMLElement>(`.${c("reader-hl-more")}`);
        const toggle = pop?.querySelector<HTMLElement>(`.${c("reader-hl-more-toggle")}`);
        if (!pop || !region || !toggle) return;
        pop.toggleClass("is-expanded", open);
        if (open) region.removeAttribute("hidden");
        else region.setAttribute("hidden", "");
        toggle.setAttribute("aria-expanded", String(open));
    }

    /**
     * Esc on the popover (#811 FR-13): an open *More* folds first, focus back on it; then the popover
     * goes. The Reader's next step waits for the next Esc.
     */
    escapePopover(): void {
        const pop = this.popover;
        if (pop?.hasClass("is-expanded")) {
            this.setMore(false);
            pop.querySelector<HTMLElement>(`.${c("reader-hl-more-toggle")}`)?.focus();
            return;
        }
        this.hidePopover();
    }

    /**
     * Tab from the page (#811 FR-12, D2): focus goes to the popover's first button, and the arrows walk
     * it from there. The words stay selected — focusing a button does not clear them. False when there
     * is no popover to enter, or focus is in it already.
     */
    focusInPopover(target?: EventTarget | null): boolean {
        const pop = this.popover;
        if (!pop || pop.hasClass(c("reader-hl-pop--editing")) || pop.hasClass(c("reader-hl-pop--status"))) return false;
        if (target && pop.contains(target as Node)) return false;
        const first = this.focusRows(pop)[0]?.[0];
        if (!first) return false;
        first.focus();
        return true;
    }

    /** The popover's buttons, row by row, as the arrows walk them: More's only while it is open. */
    private focusRows(pop: HTMLElement): HTMLElement[][] {
        const open = pop.hasClass("is-expanded");
        const rows = [c("reader-hl-first"), c("reader-hl-second"), ...(open ? [c("reader-hl-more-list"), c("reader-hl-think")] : [])];
        return rows.map((cls) => Array.from(pop.querySelector<HTMLElement>(`.${cls}`)?.querySelectorAll<HTMLElement>("button") ?? []));
    }

    /** An arrow key on a button of the popover (FR-12): focus moves; nothing else hears it. */
    private walkPopover(event: KeyboardEvent): void {
        const pop = this.popover;
        if (!pop || !ARROWS.has(event.key)) return;
        const rows = this.focusRows(pop);
        const target = event.target as HTMLElement | null;
        const row = rows.findIndex((buttons) => buttons.includes(target as HTMLElement));
        if (row < 0) return;
        event.preventDefault();
        event.stopPropagation();
        const next = nextFocus(
            rows.map((buttons) => buttons.length),
            { row, col: rows[row].indexOf(target as HTMLElement) },
            event.key
        );
        rows[next.row]?.[next.col]?.focus();
    }

    /** The chapter's language, as *Look up* counts words by it (#757). */
    private bodyLanguage(): string | undefined {
        const el = this.body?.closest?.("[lang]");
        return el?.getAttribute?.("lang") || undefined;
    }

    /**
     * Where the popover opens (#811 FR-14–FR-17, D4): measured once, collapsed, then placed below the
     * words — or above, a line clear of them, when there is no room below. A finger's is below, as it
     * always was. It never changes side while open.
     */
    private place(pop: HTMLElement, rect: SelectionInfo["rect"], touch: boolean): void {
        if (touch) return;
        const host = this.view.host;
        const box = host.getBoundingClientRect();
        const room = this.view.pageRoom?.() ?? { top: box.top, bottom: box.top + box.height };
        const top = rect.top;
        const bottom = rect.top + (rect.height ?? 0);
        // No layout to measure against (a pane not laid out yet): below, as the spec prefers.
        const known = room.bottom > room.top;
        const style = this.body ? ownWindow(host)?.getComputedStyle?.(this.body) : undefined;
        const lineHeight = parseFloat(style?.lineHeight ?? "");
        const fontSize = parseFloat(style?.fontSize ?? "");
        const line = lineHeight > 0 ? lineHeight : fontSize > 0 ? fontSize * 1.5 : FALLBACK_LINE_PX;
        const placed = known
            ? placePopover({ selection: { top, bottom }, room, height: pop.getBoundingClientRect().height, line, gap: POPOVER_GAP_PX, touch })
            : { side: "below" as const, y: bottom + POPOVER_GAP_PX };
        pop.addClass(c(placed.side === "below" ? "reader-hl-pop--below" : "reader-hl-pop--above"));
        // Below, the stylesheet keeps its own gap under the words; above, `y` is already clear of the line.
        const y = placed.side === "below" ? placed.y - POPOVER_GAP_PX : placed.y;
        pop.setCssProps?.({ "--zf-hl-y": `${Math.round(y - box.top)}px` });
    }

    /**
     * The *Think* group (#756 FR-1, #811 FR-7): the moves you can make on this passage, last in *More*.
     * A move takes the popover away and asks from where its button was — the answer is born there.
     */
    private thinkGroup(region: HTMLElement, passage: ThinkPassage, moves: readonly ThinkMove[]): void {
        const group = region.createDiv({ cls: c("reader-hl-think"), attr: { role: "group", "aria-label": t("reader_think_row") } });
        group.createSpan({ cls: c("reader-hl-think-label"), text: t("reader_think_row") });
        for (const move of moves) {
            const button = this.button(group, move.label, false, () => {
                const r = button.getBoundingClientRect();
                const from = { left: r.left, top: r.top, width: r.width, height: r.height };
                this.hidePopover();
                move.run(passage, from);
            });
            button.addClass(c("reader-hl-think-move"));
            button.setAttribute("data-zf-move", move.id);
        }
    }

    /**
     * A highlight made into a claim (#762 FR-5): it is kept — never set aside — and points at the new
     * note; its marks take the claim tick, and its margin row says *Claim: …*.
     */
    async markClaimed(id: string, path: string, on = true): Promise<void> {
        const entry = this.anchored.find((candidate) => candidate.thought.id === id);
        if (!entry) return;
        const kept = (entry.thought.claims ?? []).filter((held) => held !== path);
        const claims = on ? [...kept, path] : kept;
        const thought: Thought = { ...entry.thought, claims };
        if (claims.length === 0) delete thought.claims;
        entry.thought = thought;
        // Taken back (#762): the tick goes once nothing is claimed from it any more.
        // The tick sits where the passage begins: on its first mark only, whatever marks precede it.
        entry.marks.forEach((mark, i) => {
            if (claims.length > 0) mark.addClass(c("reader-highlight--claim"), ...(i === 0 ? [c("reader-highlight--claim-start")] : []));
            else mark.removeClass(c("reader-highlight--claim"), c("reader-highlight--claim-start"), c("reader-highlight--claim-kept"));
        });
        this.renderMargin();
        this.view.onChange();
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-claim", label: thought.about ?? id }, () => this.store.save(thought));
        } catch (error) {
            log.warn(`[Reader] the highlight could not point at its claim: ${error instanceof Error ? error.name : "error"}`);
        }
    }

    /** Where a passage starting at `offset` is, exactly (#751 FR-5): the chapter, and its print page. */
    private placedAt(offset: number): ThoughtLocator | null {
        if (!this.locator) return null;
        const page = this.locator.page ?? printPageAt(this.pageMarks, offset);
        return { ...this.locator, ...(page ? { page } : {}) };
    }

    /** The paragraph a passage sits in and the one before, from the chapter open now (#759 FR-4). */
    contextOf(quote: ThoughtQuote): { paragraph: string; previous: string } {
        if (!this.body) return { paragraph: quote.exact, previous: "" };
        return paragraphsAround(this.body, quote);
    }

    /** An accepted tension (#756 FR-17): the highlight it answers gets a small tick on the page. */
    markTension(id: string): void {
        const entry = this.anchored.find((candidate) => candidate.thought.id === id);
        for (const mark of entry?.marks ?? []) mark.addClass(c("reader-highlight--tension"));
    }

    private openNoteEditor(selection: SelectionInfo, span: TextSpan, quote: ThoughtQuote, meaning: HighlightMeaning = this.lastMeaning): void {
        const pop = this.openPopover(selection.rect, "editing");
        // Marked before the box takes focus — and the selection with it.
        if (this.body) {
            this.pending = wrapSpan(this.body, span, () => this.makeMark("pending"), this.tinter("pending", meaning)) as unknown as HTMLElement[];
            this.pending.forEach((mark) => mark.addClass(c("reader-highlight--pending"), c(`reader-highlight--${meaning}`)));
        }
        this.noteForm(pop, "", (text) => void this.keep(selection, span, quote, text, meaning));
    }

    private clearPending(): void {
        this.pending.forEach((mark) => unwrapMark(mark));
        this.pending = [];
        this.untint("pending");
    }

    /** A small form for a margin note: Ctrl/Cmd-Enter saves, Esc cancels. */
    private noteForm(pop: HTMLElement, initial: string, save: (text: string) => void): void {
        const area = pop.createEl("textarea", {
            cls: c("reader-hl-input"),
            attr: { rows: "3", placeholder: t("reader_hl_note_placeholder"), "aria-label": t("reader_hl_note_placeholder") },
        });
        area.value = initial;
        const actions = pop.createDiv({ cls: c("reader-hl-actions") });
        this.button(actions, "reader_hl_save", true, () => save(area.value));
        this.button(actions, "reader_hl_cancel", false, () => this.hidePopover());
        (this.popoverScope ?? this.view.owner).registerDomEvent(area, "keydown", (event: KeyboardEvent) => {
            if (event.isComposing) return;
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                save(area.value);
            } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                this.hidePopover();
            }
        });
        area.focus?.();
    }

    // ── writes (all of them thoughts, never the note) ────────────────────────

    private async keep(selection: SelectionInfo, span: TextSpan, quote: ThoughtQuote, note: string, meaning: HighlightMeaning = this.lastMeaning): Promise<void> {
        // One passage marked in several goes is one highlight (#868): the words that continue the one
        // kept last grow it, as a stroke grows a stroke (#746 FR-5).
        const last = this.continued(span, meaning);
        if (last) {
            this.clearPending();
            const actions = (next: Thought): StatusAction[] => [{ key: "reader_hl_undo", run: () => void this.unextend(next, last), thought: next }];
            if (await this.extend(last, span, { note, origin: "selection", actions, clear: () => selection.clear() })) return;
        }
        const made = await this.keepSpan(span, quote, { note, meaning, origin: "selection", clear: () => selection.clear() });
        if (made) this.lastKept = made.id;
    }

    /**
     * The highlight a selection continues (#868 FR-1, FR-3): the one kept last in this reading, still
     * on the page, of the same meaning and layer, whose words these words continue. None otherwise.
     */
    private continued(span: TextSpan, meaning: HighlightMeaning): Thought | null {
        const body = this.body;
        const entry = this.lastKept ? this.anchored.find((candidate) => candidate.thought.id === this.lastKept) : undefined;
        const thought = entry?.thought;
        if (!body || !thought?.quote || meaningOf(thought) !== meaning) return null;
        if (layerOf(thought) !== (this.view.layerForNew?.() ?? DEFAULT_LAYER)) return null;
        const text = chapterText(body);
        const old = anchorAll(text, [{ thought, quote: thought.quote }]).anchored[0]?.span;
        return old && continuesSpan(old, span, text) ? thought : null;
    }

    /**
     * Keep a span of the chapter as a highlight — **the** highlight engine (#746 FR-3): a selection's
     * *Idea* and a stroke across a line both come here, so the thought is the same, field for field.
     * A stroke's marks are drawn at once and the write follows (FR-12); a selection's after it.
     */
    async keepSpan(span: TextSpan, quote: ThoughtQuote, options: KeepOptions = {}): Promise<Thought | undefined> {
        const notePath = this.notePath;
        const body = this.body;
        if (!notePath || !body) return undefined;
        if (!this.store.folder()) {
            this.status("reader_hl_no_lab");
            return undefined;
        }
        const meaning = options.meaning ?? this.lastMeaning;
        const stroke = options.origin === "stroke";
        const tint = `stroke#${++this.tintSeq}`;
        const early = stroke ? this.drawPending(span, meaning, options.direction, tint) : [];
        // The place, exactly (#751 FR-5): the chapter's identity rides with it, and the print page the
        // passage starts on — only when the book declares one (FR-3).
        const made = await this.writeHighlight(notePath, this.placedAt(span.start), quote, options.note ?? "", meaning);
        if (!made) {
            early.forEach((mark) => unwrapMark(mark));
            this.untint(tint);
            this.status("reader_hl_failed");
            return undefined;
        }
        this.counted(options.note ?? "", meaning);
        options.clear?.();
        if (this.body !== body) return made; // the chapter turned while the thought was written
        this.clearPending(); // the real marks take its place
        this.retint(tint, made.id);
        const thought = made;
        let marks: HTMLElement[];
        if (stroke) marks = this.decorate(thought, early);
        else {
            marks = this.draw(thought, span);
            // A marker drawn across the words, once — only on the highlight just made (#667).
            marks.forEach((mark) => mark.addClass(c("reader-highlight--new")));
        }
        this.insert(thought, marks, span.start);
        this.settleIntoMargin(marks[0], thought);
        this.status(stroke ? HIGHLIGHTED[meaning] : "reader_hl_saved", options.actions?.(thought) ?? [{ key: "reader_hl_undo", run: () => void this.forget(thought, false), thought }], stroke);
        return thought;
    }

    /**
     * Mark while listening (#765 FR-6): the sentence the voice is reading, kept as a highlight — the
     * meaning used last (#720) and the layer new marks go to (#758), with the marker's sweep. The same
     * engine as a selection's *Idea*; nothing else is written, and the voice is not stopped.
     */
    markSpan(start: number, end: number): Promise<Thought | undefined> {
        const found = this.quoteFor(start, end);
        if (!found) return Promise.resolve(undefined);
        return this.keepSpan(found.span, found.quote, { origin: "selection" });
    }

    /**
     * A passage of a printed page in Page view (#746 FR-9): the same write as any highlight, about the
     * paper and cited at that page. Its marks are the ink layer's rectangles over the page.
     */
    async keepPassage(locator: ThoughtLocator, quote: ThoughtQuote, options: KeepOptions = {}): Promise<Thought | undefined> {
        const notePath = this.notePath;
        if (!notePath) return undefined;
        if (!this.store.folder()) {
            this.status("reader_hl_no_lab");
            return undefined;
        }
        const meaning = options.meaning ?? this.lastMeaning;
        const made = await this.writeHighlight(notePath, locator, quote, options.note ?? "", meaning);
        if (!made) {
            this.status("reader_hl_failed");
            return undefined;
        }
        this.counted(options.note ?? "", meaning);
        const thought = made;
        this.status(HIGHLIGHTED[meaning], options.actions?.(thought) ?? [{ key: "reader_hl_undo", run: () => void this.forget(thought, false), thought }], true);
        return thought;
    }

    /** The one write of a highlight: a thought about the note, its quote cited under its place. */
    private async writeHighlight(notePath: string, locator: ThoughtLocator | null, quote: ThoughtQuote, note: string, meaning: HighlightMeaning): Promise<Thought | undefined> {
        let made: Thought | undefined;
        // In a source, the place is the heading a passage is cited under when its page has none.
        const cited = locator && !quote.heading && locator.label ? { ...quote, heading: locator.label } : quote;
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-highlight", label: notePath }, async () => {
                made = await this.store.write(note.trim(), { about: notePath, quote: cited, ...(locator ? { locator } : {}), meaning, ...this.newLayer() });
            });
        } catch (error) {
            log.error(`[Reader] could not keep a highlight on ${notePath}: ${String(error)}`);
        }
        return made;
    }

    /** The layer a mark made now goes to (#758 FR-4); the reading layer is never written. */
    private newLayer(): { layer?: MarkLayer } {
        const layer = this.view.layerForNew?.() ?? DEFAULT_LAYER;
        return layer === DEFAULT_LAYER ? {} : { layer };
    }

    private counted(note: string, meaning: HighlightMeaning): void {
        this.made++;
        if (note.trim()) this.noted++;
        this.lastMeaning = meaning;
    }

    /**
     * Grow a highlight onto contiguous words (#746 FR-5): one recorded update of its quote, and marks
     * for the added words only — they sweep, the earlier ones stay as they are (FR-13).
     */
    async extend(thought: Thought, span: TextSpan, options: Pick<KeepOptions, "direction" | "actions" | "note" | "origin" | "clear"> = {}): Promise<Thought | undefined> {
        const body = this.body;
        const entry = this.anchored.find((candidate) => candidate.thought.id === thought.id);
        if (!body || !entry || !thought.quote) return undefined;
        const text = chapterText(body);
        const old = anchorAll(text, [{ thought, quote: thought.quote }]).anchored[0]?.span;
        if (!old) return undefined;
        const union = { start: Math.min(old.start, span.start), end: Math.max(old.end, span.end) };
        const found = this.quoteFor(union.start, union.end);
        if (!found) return undefined;
        const locator = this.locator;
        const quote = locator && !found.quote.heading && locator.label ? { ...found.quote, heading: locator.label } : found.quote;
        // A note on the added words joins the highlight's own, on a line of its own (#868 FR-2).
        const note = options.note?.trim() ?? "";
        const had = thought.text.trim();
        const next: Thought = { ...thought, quote, ...(note ? { text: had ? `${had}\n${note}` : note } : {}) };
        const meaning = meaningOf(thought);
        // What the added words cover of an equation or a drawing is tinted on its own key, so taking
        // the extension back takes only that tint (#770).
        const tint = `${thought.id}#${++this.tintSeq}`;
        // The added words, marked at once (FR-12): before the old start, and after the old end.
        const added = [
            { start: union.start, end: old.start },
            { start: old.end, end: union.end },
        ]
            .filter((part) => part.end > part.start)
            .flatMap((part) => this.drawPending(part, meaning, options.direction, tint));
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-highlight", label: thought.about ?? "" }, () => this.store.save(next));
        } catch (error) {
            log.error(`[Reader] could not extend a highlight: ${String(error)}`);
            added.forEach((mark) => unwrapMark(mark));
            this.untint(tint);
            this.status("reader_hl_failed");
            return undefined;
        }
        options.clear?.();
        if (note && !had) this.noted++;
        this.decorate(next, added);
        entry.thought = next;
        entry.marks.push(...added);
        this.extensions.set(next, { marks: added, tint });
        this.renderMargin();
        this.view.onChange();
        // A selection's answer stays by the words; a stroke's sits low, clear of the hand (#746).
        const selection = options.origin === "selection";
        this.status(selection ? "reader_hl_grown" : HIGHLIGHTED[meaning], options.actions?.(next) ?? [], !selection);
        return next;
    }

    /** Take an extension back: the quote it had, and the added marks fade away (FR-14). */
    async unextend(grown: Thought, before: Thought): Promise<boolean> {
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-highlight", label: before.about ?? "" }, () => this.store.save(before));
        } catch (error) {
            log.error(`[Reader] could not take an extension back: ${String(error)}`);
            this.status("reader_hl_failed");
            return false;
        }
        const extension = this.extensions.get(grown);
        const added = extension?.marks ?? [];
        this.extensions.delete(grown);
        this.fadeMarks(added);
        if (extension) this.untint(extension.tint);
        const entry = this.anchored.find((candidate) => candidate.thought.id === before.id);
        if (entry) {
            entry.thought = before;
            entry.marks = entry.marks.filter((mark) => !added.includes(mark));
        }
        this.renderMargin();
        this.view.onChange();
        this.hideStatus();
        return true;
    }

    // ── what a gesture asks of the highlights (#747) ─────────────────────────

    /** The chapter's highlights on screen: each thought with its marks' boxes (client px). */
    markBoxes(): { thought: Thought; rects: { left: number; top: number; width: number; height: number }[] }[] {
        return this.anchored.map((entry) => ({
            thought: entry.thought,
            rects: entry.marks
                .filter((mark) => mark.isConnected !== false)
                .flatMap((mark) => Array.from(mark.getClientRects?.() ?? []))
                .filter((rect) => rect.width > 0 || rect.height > 0)
                .map((rect) => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })),
        }));
    }

    /** The marks of a highlight on screen, by id: what a joined arrow brightens. */
    marksOf(id: string): HTMLElement[] {
        return this.anchored.find((entry) => entry.thought.id === id)?.marks.filter((mark) => mark.isConnected !== false) ?? [];
    }

    /** A highlight was saved elsewhere (an arrow's link, #747 FR-4): the one on screen is that one now. */
    adopt(thought: Thought): void {
        const entry = this.anchored.find((candidate) => candidate.thought.id === thought.id);
        if (entry) entry.thought = thought;
    }

    /**
     * The eraser over a highlight (#747 FR-6): to the trash as removing one does,
     * its wash fading. It stays counted — it was made, and an erase is not an undo. Joins the caller's
     * batch, so an eraser over several marks is one recorded write.
     */
    async erase(thought: Thought): Promise<boolean> {
        const entry = this.anchored.find((candidate) => candidate.thought.id === thought.id);
        // The wash goes with the eraser, before the write (FR-14, FR-16) — and comes back if it fails.
        this.fadeMarks(entry?.marks ?? []);
        this.anchored = this.anchored.filter((candidate) => candidate.thought.id !== thought.id);
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-highlight", label: thought.about ?? "" }, () => this.store.discard(thought));
        } catch (error) {
            log.error(`[Reader] could not erase a highlight: ${String(error)}`);
            this.status("reader_hl_failed");
            const body = this.body;
            const span = body && thought.quote ? anchorAll(chapterText(body), [{ thought, quote: thought.quote }]).anchored[0]?.span : undefined;
            if (span) this.insert(thought, this.draw(thought, span), span.start);
            return false;
        }
        this.renderMargin();
        this.view.onChange();
        return true;
    }

    /** Undo of an erase: the highlight back from the trash and drawn again; its marks, to fade in. */
    async unerase(thought: Thought): Promise<HTMLElement[] | null> {
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-highlight", label: thought.about ?? "" }, () => this.store.restore(thought));
        } catch (error) {
            log.error(`[Reader] could not restore a highlight: ${String(error)}`);
            this.status("reader_hl_failed");
            return null;
        }
        const body = this.body;
        if (!body || !thought.quote) return [];
        const { anchored } = anchorAll(chapterText(body), [{ thought, quote: thought.quote }]);
        if (!anchored[0]) {
            this.detached.push(thought);
            this.renderMargin();
            this.view.onChange();
            return [];
        }
        const marks = this.draw(thought, anchored[0].span);
        this.insert(thought, marks, anchored[0].span.start);
        return marks;
    }

    /** Only a status line goes (#747): an undo from the palette never takes a note being written. */
    hideStatus(): void {
        if (this.popover?.hasClass(c("reader-hl-pop--status"))) this.hidePopover();
    }

    /**
     * A gesture's line (#747 FR-8): what it did, low on the page, with its ways back. `onClose` when it
     * goes: the lasso's loop goes with the *Delete* it offered.
     */
    say(key: LocaleKey, actions: StatusAction[] = [], onClose?: () => void): void {
        this.status(key, actions, true);
        this.popoverClosed = onClose ?? null;
    }

    /** Take back the highlight just made (#746 FR-7): to the trash, its marks fading, never counted. */
    async takeBack(thought: Thought): Promise<boolean> {
        return this.forget(thought, false, true);
    }

    private async keepPageNote(text: string): Promise<void> {
        const notePath = this.notePath;
        const locator = this.locator;
        if (!notePath || !locator || !text.trim()) {
            this.hidePopover();
            return;
        }
        if (!this.store.folder()) {
            this.status("reader_hl_no_lab");
            return;
        }
        let made: Thought | undefined;
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-highlight", label: notePath }, async () => {
                made = await this.store.write(text.trim(), { about: notePath, locator, ...this.newLayer() });
            });
        } catch (error) {
            log.error(`[Reader] could not keep a note on ${notePath}: ${String(error)}`);
        }
        if (!made) {
            this.status("reader_hl_failed");
            return;
        }
        this.noted++;
        this.pageNotes.push(made);
        this.renderMargin();
        this.view.onChange();
        const thought = made;
        this.status("reader_hl_page_saved", [{ key: "reader_hl_undo", run: () => void this.forgetPageNote(thought), thought }]);
    }

    private async forgetPageNote(thought: Thought): Promise<void> {
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-highlight", label: thought.about ?? "" }, () => this.store.discard(thought));
        } catch (error) {
            log.error(`[Reader] could not remove a note: ${String(error)}`);
            this.status("reader_hl_failed");
            return;
        }
        this.pageNotes = this.pageNotes.filter((candidate) => candidate.id !== thought.id);
        this.noted = Math.max(0, this.noted - 1);
        this.renderMargin();
        this.view.onChange();
        this.hidePopover();
    }

    private async editNote(thought: Thought, text: string): Promise<void> {
        const next = { ...thought, text: text.trim() };
        if (!thought.text.trim() && next.text) this.noted++;
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-highlight", label: thought.about ?? "" }, () => this.store.save(next));
        } catch (error) {
            log.error(`[Reader] could not save a margin note: ${String(error)}`);
            this.status("reader_hl_failed");
            return;
        }
        const entry = this.anchored.find((candidate) => candidate.thought.id === thought.id);
        if (entry) entry.thought = next;
        this.ledgerOnly(thought, next);
        this.renderMargin();
        this.view.onChange();
        this.hidePopover();
    }

    /** Take a highlight away — its thought goes to the trash, never lost — with an Undo. */
    private async forget(thought: Thought, offerUndo = true, fade = false): Promise<boolean> {
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-highlight", label: thought.about ?? "" }, () =>
                this.store.discard(thought)
            );
        } catch (error) {
            log.error(`[Reader] could not remove a highlight: ${String(error)}`);
            this.status("reader_hl_failed");
            return false;
        }
        const entry = this.anchored.find((candidate) => candidate.thought.id === thought.id);
        if (fade) this.fadeMarks(entry?.marks ?? []);
        else entry?.marks.forEach((mark) => unwrapMark(mark));
        this.untint(thought.id);
        this.anchored = this.anchored.filter((candidate) => candidate.thought.id !== thought.id);
        this.detached = this.detached.filter((candidate) => candidate.id !== thought.id);
        this.renderMargin();
        this.view.onChange();
        if (offerUndo) this.status("reader_hl_removed", [{ key: "reader_hl_undo", run: () => void this.bringBack(thought) }]);
        else {
            // Taking back the highlight just made: it no longer counts for this reading.
            this.made = Math.max(0, this.made - 1);
            if (thought.text.trim()) this.noted = Math.max(0, this.noted - 1);
            // Its line goes; a popover of something else (a lasso's offer, a note) stays (#747).
            this.hideStatus();
        }
        return true;
    }

    private async bringBack(thought: Thought): Promise<void> {
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-highlight", label: thought.about ?? "" }, () =>
                this.store.restore(thought)
            );
        } catch (error) {
            log.error(`[Reader] could not restore a highlight: ${String(error)}`);
            this.status("reader_hl_failed");
            return;
        }
        const body = this.body;
        if (!body || !thought.quote) return;
        const { anchored } = anchorAll(chapterText(body), [{ thought, quote: thought.quote }]);
        if (anchored[0]) this.insert(thought, this.draw(thought, anchored[0].span), anchored[0].span.start);
        else this.detached.push(thought);
        this.renderMargin();
        this.view.onChange();
        this.hidePopover();
    }

    // ── drawing ──────────────────────────────────────────────────────────────

    private draw(thought: Thought, span: TextSpan): HTMLElement[] {
        const body = this.body;
        if (!body) return [];
        const marks = wrapSpan(body, span, () => this.makeMark(thought.id), this.tinter(thought.id, meaningOf(thought))) as unknown as HTMLElement[];
        marks.forEach((mark) => mark.addClass(c(`reader-highlight--${meaningOf(thought)}`)));
        // A passage that became a claim (#762) wears its tick, already there — it faded in once, when made.
        if (thought.claims?.length) marks.forEach((mark, i) => mark.addClass(c("reader-highlight--claim"), c("reader-highlight--claim-kept"), ...(i === 0 ? [c("reader-highlight--claim-start")] : [])));
        return this.decorate(thought, marks);
    }

    /**
     * A stroke's marks, drawn before their thought is written (#746 FR-12): in the meaning's colour,
     * swept from the side the stroke began (FR-11). `decorate` binds them once the write answers.
     */
    private drawPending(span: TextSpan, meaning: HighlightMeaning, direction: "ltr" | "rtl" | undefined, tint: string): HTMLElement[] {
        const body = this.body;
        if (!body) return [];
        const marks = wrapSpan(body, span, () => this.makeMark(PENDING_ID), this.tinter(tint, meaning)) as unknown as HTMLElement[];
        for (const mark of marks) {
            mark.addClass(c(`reader-highlight--${meaning}`), c("reader-highlight--new"));
            if (direction === "rtl") mark.addClass(c("reader-highlight--new-rtl"));
        }
        return marks;
    }

    /** Marks that belong to a thought: its id, its note's underline, and a click that opens it. */
    private decorate(thought: Thought, marks: HTMLElement[]): HTMLElement[] {
        if (thought.text.trim()) marks.forEach((mark) => mark.addClass(c("reader-highlight--noted")));
        for (const mark of marks) {
            mark.setAttribute("data-hl", thought.id);
            this.component?.registerDomEvent(mark, "click", (event: MouseEvent) => {
                // Inside a link the mark wins: its popover, not the link's peek or navigation.
                event.preventDefault();
                event.stopPropagation();
                this.openMark(thought.id, mark);
            });
        }
        return marks;
    }

    /**
     * Tint an equation or a drawing the highlight `id` covers, whole and in its meaning's ink (#770).
     * Static: never animated.
     */
    private tinter(id: string, meaning: HighlightMeaning): (foreign: unknown) => void {
        return (foreign) => {
            const el = foreign as HTMLElement;
            for (const other of HIGHLIGHT_MEANINGS) el.removeClass(c(`reader-highlight--${other}`));
            el.addClass(c("reader-highlight-foreign"), c(`reader-highlight--${meaning}`));
            const list = this.tints.get(id) ?? [];
            list.push(el);
            this.tints.set(id, list);
        };
    }

    /** What highlight `id` tints: its own key, and its extensions' (`<id>#n`). */
    private tintsOf(id: string): HTMLElement[] {
        return [...this.tints.entries()].filter(([key]) => key === id || key.startsWith(`${id}#`)).flatMap(([, list]) => list);
    }

    /** A stroke's tints, drawn before its thought was written, now belong to the thought. */
    private retint(from: string, to: string): void {
        const list = this.tints.get(from);
        this.tints.delete(from);
        if (list) this.tints.set(to, [...(this.tints.get(to) ?? []), ...list]);
    }

    /** Take the tint of highlight `id` away — unless another highlight still covers the same root. */
    private untint(id: string): void {
        const list = this.tintsOf(id);
        for (const key of this.tints.keys()) if (key === id || key.startsWith(`${id}#`)) this.tints.delete(key);
        if (!list.length) return;
        const still = new Set([...this.tints.values()].flat());
        for (const el of list) {
            if (still.has(el)) continue;
            el.removeClass(c("reader-highlight-foreign"), ...HIGHLIGHT_MEANINGS.map((meaning) => c(`reader-highlight--${meaning}`)));
        }
    }

    private insert(thought: Thought, marks: HTMLElement[], start: number): void {
        this.anchored.push({ thought, marks });
        const text = this.body ? chapterText(this.body) : "";
        const at = (entry: { thought: Thought }) => text.indexOf(entry.thought.quote?.exact ?? "");
        this.anchored.sort((a, b) => (a.thought.id === thought.id ? start : at(a)) - (b.thought.id === thought.id ? start : at(b)));
        this.renderMargin();
        this.view.onChange();
    }

    /**
     * A click on a highlight (#811 D1): its note; the dots, its meaning marked, *Edit note* and *More*;
     * then its own two, *Open in Think* and *Delete*; and in *More*, the rest in one order.
     */
    private openMark(id: string, mark: HTMLElement): void {
        const entry = this.anchored.find((candidate) => candidate.thought.id === id);
        if (!entry) return;
        const thought = entry.thought;
        const rect = mark.getBoundingClientRect();
        const pop = this.openPopover({ left: rect.left, top: rect.top, width: rect.width }, "mark");
        const note = thought.text.trim();
        pop.createDiv({ cls: c(note ? "reader-hl-pop-note" : "reader-hl-pop-empty"), text: note || t("reader_hl_no_note") });
        const passage = thought.locator && thought.quote ? { quote: thought.quote, locator: thought.locator, highlight: thought } : null;
        const offers = this.passageOffers(passage, { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, undefined, null);
        const more: Offer[] = [];
        for (const action of ["claim", "link"] as const) {
            const offer = offers.get(action);
            if (offer) more.push(offer);
        }
        // A passage of a book or a paper becomes a note that cites its page (#683).
        if (thought.locator) {
            more.push((parent) =>
                this.button(parent, "reader_hl_crystallize", false, () => {
                    this.hidePopover();
                    this.toNote(this.view.app, thought);
                })
            );
        }
        const cite = offers.get("cite");
        if (cite) more.push(cite);
        // Its layer, changed in place (#758 FR-6).
        more.push((parent) => {
            const layers = parent.createDiv({ cls: c("reader-hl-layers"), attr: { role: "group", "aria-label": t("reader_hl_layer") } });
            layers.createSpan({ cls: c("reader-hl-layers-label"), text: t("reader_hl_layer") });
            for (const layer of MARK_LAYERS) {
                const on = layer === layerOf(thought);
                const button = layers.createEl("button", {
                    cls: [c("reader-hl-layer"), ...(on ? ["is-active"] : [])],
                    text: t(LAYER_LABEL[layer]),
                    attr: { type: "button", "aria-pressed": String(on), "data-layer": layer },
                });
                (this.popoverScope ?? this.view.owner).registerDomEvent(button, "click", () => void this.changeLayer(thought, layer));
            }
            return layers;
        });
        this.renderRows(pop, {
            first: (row) => {
                // What it means, changed in place (#720).
                const dots = row.createDiv({ cls: c("reader-hl-meanings") });
                for (const meaning of HIGHLIGHT_MEANINGS) {
                    this.meaningButton(dots, meaning, meaning === meaningOf(thought), () => void this.changeMeaning(thought, meaning));
                }
                this.button(row, note ? "reader_hl_edit_note" : "reader_hl_add_note", true, () => {
                    const editing = this.openPopover({ left: rect.left, top: rect.top, width: rect.width }, "editing");
                    this.noteForm(editing, note, (text) => void this.editNote(thought, text));
                });
            },
            second: [],
            // An existing highlight's own two (D1): fixed, never chosen by its length.
            fixedSecond: (row) => {
                this.button(row, "reader_hl_open_think", false, () => {
                    this.hidePopover();
                    this.openThink(this.view.app, thought.about ?? this.notePath ?? "");
                });
                this.button(row, "reader_hl_delete", false, () => void this.forget(thought));
            },
            more,
            // A passage you marked yesterday can be worked on today (#756 FR-1).
            think: passage,
        });
        this.place(pop, { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, touchPointer({ pointerType: this.pointer }));
    }

    /**
     * A highlight finds its place (#724): a faint ghost of the passage drifts into its card in the
     * margin, so you see where it went with nothing to confirm. Only on a wide pane, where the margin
     * shows; transform and opacity only.
     */
    private settleIntoMargin(mark: HTMLElement | undefined, thought: Thought): void {
        const host = this.view.host;
        const row = this.margin?.querySelector?.<HTMLElement>(`[data-hl="${thought.id}"]`);
        if (!mark || !row || !motionWelcome(host)) return;
        const from = mark.getBoundingClientRect();
        const to = row.getBoundingClientRect();
        if (!(to.width > 0) || !(from.width > 0)) return;
        const ghost = createDiv({ cls: [c("reader-hl-ghost"), c(`reader-hl-item--${meaningOf(thought)}`)] });
        fly(host, ghost, from, to, { duration: MOTION.base, startOpacity: 0.6 });
    }

    /**
     * Marks taken away by an Undo (#746 FR-14): their wash fades in 120 ms, the words never do. The
     * marks go at once and a ghost of each line's wash — a rectangle over the host — fades in their
     * place; opacity only. Under reduced motion they simply go.
     */
    private fadeMarks(marks: HTMLElement[]): void {
        const host = this.view.host;
        const welcome = motionWelcome(host);
        const box = welcome ? host.getBoundingClientRect() : null;
        for (const mark of marks) {
            if (box && mark.isConnected !== false) {
                const meaning = HIGHLIGHT_MEANINGS.find((m) => mark.hasClass(c(`reader-highlight--${m}`))) ?? DEFAULT_MEANING;
                for (const rect of Array.from(mark.getClientRects?.() ?? [])) {
                    if (!(rect.width > 0)) continue;
                    const ghost = host.createDiv({ cls: [c("reader-hl-washout"), c(`reader-highlight--${meaning}`)], attr: { "aria-hidden": "true" } });
                    ghost.setCssProps?.({
                        "--zf-hl-x": `${Math.round(rect.left - box.left)}px`,
                        "--zf-hl-y": `${Math.round(rect.top - box.top)}px`,
                        "--zf-hl-w": `${Math.round(rect.width)}px`,
                        "--zf-hl-h": `${Math.round(rect.height)}px`,
                    });
                    const animation = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.fast, easing: "ease-out", fill: "forwards" });
                    animation.onfinish = () => ghost.remove();
                    ownWindow(host)?.setTimeout(() => ghost.remove(), MOTION.fast + 200);
                }
            }
            unwrapMark(mark);
        }
    }

    /** The meanings as chips with their counts; one click shows only that meaning, again for all (#720). */
    private renderFilter(host: HTMLElement, scope: Component): void {
        const counts = new Map<HighlightMeaning, number>();
        for (const entry of this.anchored) counts.set(meaningOf(entry.thought), (counts.get(meaningOf(entry.thought)) ?? 0) + 1);
        if (counts.size < 2 && !this.filter) return;
        const row = host.createDiv({ cls: c("reader-hl-filter"), attr: { role: "group", "aria-label": t("reader_hl_filter") } });
        const chip = (label: string, count: number, on: boolean, meaning: HighlightMeaning | null) => {
            const el = row.createEl("button", {
                cls: [c("reader-hl-filter-chip"), ...(meaning ? [c(`reader-hl-filter-chip--${meaning}`)] : []), ...(on ? ["is-active"] : [])],
                attr: { type: "button", "aria-pressed": String(on) },
            });
            if (meaning) el.createSpan({ cls: [c("reader-hl-swatch"), c(`reader-hl-swatch--${meaning}`)] });
            el.createSpan({ text: label });
            el.createSpan({ cls: c("reader-hl-filter-count"), text: String(count) });
            scope.registerDomEvent(el, "click", () => {
                this.filter = this.filter === meaning ? null : meaning;
                this.renderMargin();
                this.view.onChange();
            });
        };
        chip(t("reader_hl_filter_all"), this.anchored.length, this.filter === null, null);
        for (const meaning of HIGHLIGHT_MEANINGS) {
            const count = counts.get(meaning) ?? 0;
            if (count > 0 || this.filter === meaning) chip(t(MEANING_LABEL[meaning]), count, this.filter === meaning, meaning);
        }
    }

    /**
     * One meaning as a dot (#811 FR-2): its colour, its name said on hover and to assistive technology
     * (kept as text, hidden from sight); the one in use is marked.
     */
    private meaningButton(parent: HTMLElement, meaning: HighlightMeaning, on: boolean, run: () => void): HTMLElement {
        const name = t(MEANING_LABEL[meaning]);
        const button = parent.createEl("button", {
            cls: [c("reader-hl-meaning"), c(`reader-hl-meaning--${meaning}`), ...(on ? ["is-active"] : [])],
            attr: { type: "button", "aria-pressed": String(on), "aria-label": name, "data-meaning": meaning },
        });
        button.createSpan({ cls: [c("reader-hl-swatch"), c(`reader-hl-swatch--${meaning}`)] });
        button.createSpan({ cls: c("visually-hidden"), text: name });
        setTooltip(button, name);
        (this.popoverScope ?? this.view.owner).registerDomEvent(button, "click", run);
        return button;
    }

    /** Change what a highlight means (#720): the thought is saved, the marks take the new colour. */
    private async changeMeaning(thought: Thought, meaning: HighlightMeaning): Promise<void> {
        if (meaningOf(thought) === meaning) {
            this.hidePopover();
            return;
        }
        const next: Thought = { ...thought, meaning };
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-highlight", label: thought.about ?? "" }, () => this.store.save(next));
        } catch (error) {
            log.error(`[Reader] could not change what a highlight means: ${String(error)}`);
            this.status("reader_hl_failed");
            return;
        }
        const entry = this.anchored.find((candidate) => candidate.thought.id === thought.id);
        if (entry) {
            entry.thought = next;
            for (const mark of [...entry.marks, ...this.tintsOf(thought.id)]) {
                for (const other of HIGHLIGHT_MEANINGS) mark.removeClass(c(`reader-highlight--${other}`));
                mark.addClass(c(`reader-highlight--${meaning}`));
            }
        }
        this.lastMeaning = meaning;
        this.ledgerOnly(thought, next);
        this.renderMargin();
        this.view.onChange();
        this.hidePopover();
    }

    /**
     * Move a highlight to another layer (#758 FR-6): the thought saved as one recorded, undoable write,
     * and drawn again — where its layer is hidden, it leaves the page.
     */
    async changeLayer(thought: Thought, layer: MarkLayer): Promise<void> {
        if (layerOf(thought) === layer) {
            this.hidePopover();
            return;
        }
        const next: Thought = { ...thought, layer };
        if (layer === DEFAULT_LAYER) delete next.layer;
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-highlight", label: thought.about ?? "" }, () => this.store.save(next));
        } catch (error) {
            log.error(`[Reader] could not move a highlight to another layer: ${String(error)}`);
            this.status("reader_hl_failed");
            return;
        }
        const entry = this.anchored.find((candidate) => candidate.thought.id === thought.id);
        if (entry) entry.thought = next;
        this.ledgerOnly(thought, next);
        this.renderMargin();
        this.view.onChange();
        this.hidePopover();
    }

    private renderMargin(): void {
        this.marginScope?.unload();
        this.marginScope = null;
        if (!this.margin) return;
        this.margin.empty();
        const scope = new Component();
        scope.load();
        this.marginScope = scope;
        this.renderList(this.margin, scope);
    }

    // ── popover ──────────────────────────────────────────────────────────────

    private openPopover(rect: SelectionInfo["rect"], mode: "select" | "editing" | "mark" | "status", below = false): HTMLElement {
        this.hidePopover();
        const host = this.view.host;
        const pop = host.createDiv({
            cls: [c("reader-hl-pop"), c(`reader-hl-pop--${mode}`), ...(below ? [c("reader-hl-pop--below")] : [])],
            attr: { role: "dialog", "aria-label": t("reader_hl_label") },
        });
        const box = host.getBoundingClientRect();
        // Positioned by two custom properties the stylesheet reads — no inline layout.
        pop.setCssProps?.({
            "--zf-hl-x": `${Math.round(rect.left + rect.width / 2 - box.left)}px`,
            "--zf-hl-y": `${Math.round(rect.top + (below ? (rect.height ?? 0) : 0) - box.top)}px`,
        });
        const scope = new Component();
        scope.load();
        this.popoverScope = scope;
        // Clicks inside the popover must not count as a new selection in the chapter.
        scope.registerDomEvent(pop, "mousedown", (event: MouseEvent) => event.stopPropagation());
        // Once focus is in it, the arrows walk its buttons (#811 FR-12).
        scope.registerDomEvent(pop, "keydown", (event: KeyboardEvent) => this.walkPopover(event));
        this.popover = pop;
        return pop;
    }

    /**
     * One line that says what happened, with its ways back (an Undo, *Keep as ink*), then goes. A
     * stroke's line sits low on the page (#746), clear of the lines you may draw across next.
     */
    private status(key: LocaleKey, actions: StatusAction[] = [], low = false): void {
        const rect = this.popover?.getBoundingClientRect();
        const box = this.view.host.getBoundingClientRect();
        const where = low
            ? { left: box.left + box.width / 2, top: Math.max(box.top + box.height / 2, box.top + box.height - STROKE_STATUS_LIFT_PX), width: 0 }
            : rect
            ? { left: rect.left + rect.width / 2, top: rect.top + rect.height, width: 0 }
            : { left: box.left + box.width / 2, top: box.top + box.height / 2, width: 0 };
        const pop = this.openPopover(where, "status");
        pop.setAttribute("role", "status");
        pop.createSpan({ cls: c("reader-hl-status"), text: t(key) });
        const buttons: HTMLElement[] = [];
        for (const action of actions) {
            // An Undo is the reading's too (#810 FR-17): the button and Ctrl/⌘+Z share one guard.
            const run = action.key === "reader_hl_undo" ? this.offerUndo(action.run, action.thought) : action.run;
            const button = this.button(pop, action.key, false, () => {
                // One way back, once: the others go with it.
                buttons.forEach((b) => b.setAttribute("disabled", "true"));
                run();
            });
            buttons.push(button);
        }
        this.statusTimer = ownWindow(this.view.host)?.setTimeout(() => {
            if (this.popover === pop) this.hidePopover();
        }, STATUS_MS);
    }

    /**
     * A write's way back, offered to the reading's ledger (#810 FR-15–FR-18) — guarded once, refused
     * when its thought changed since. Without a ledger (a test, a view that has none), the run itself.
     */
    private offerUndo(run: () => void, thought?: Thought): () => void {
        const store = this.store;
        const check = thought && store.isAsWritten ? () => store.isAsWritten?.(thought) ?? true : undefined;
        const guarded = this.view.undoable?.(run, check);
        if (!guarded) return run;
        return () =>
            void guarded().then((outcome) => {
                if (outcome === "refused") this.say("reader_undo_refused");
            });
    }

    /**
     * A write with no Undo button (a meaning changed, a note edited): its way back is the ledger's only
     * (#810 FR-16), taking the thought back to what it was — refused once it changed since.
     */
    private ledgerOnly(before: Thought, after: Thought): void {
        this.offerUndo(() => void this.putBack(before, after), after);
    }

    /** A thought back as it was (#810): saved, its marks recoloured, its row redrawn. */
    private async putBack(before: Thought, after: Thought): Promise<void> {
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-highlight", label: before.about ?? "" }, () => this.store.save(before));
        } catch (error) {
            log.error(`[Reader] could not take a change back: ${String(error)}`);
            this.status("reader_hl_failed");
            return;
        }
        const entry = this.anchored.find((candidate) => candidate.thought.id === after.id);
        if (entry) {
            entry.thought = before;
            const meaning = meaningOf(before);
            for (const mark of [...entry.marks, ...this.tintsOf(before.id)]) {
                for (const other of HIGHLIGHT_MEANINGS) mark.removeClass(c(`reader-highlight--${other}`));
                mark.addClass(c(`reader-highlight--${meaning}`));
            }
        }
        this.renderMargin();
        this.view.onChange();
    }

    private button(parent: HTMLElement, key: LocaleKey, primary: boolean, run: () => void): HTMLElement {
        const button = parent.createEl("button", {
            cls: [c("reader-hl-action"), ...(primary ? ["mod-cta"] : [])],
            text: t(key),
            attr: { type: "button" },
        });
        (this.popoverScope ?? this.view.owner).registerDomEvent(button, "click", run);
        return button;
    }
}
