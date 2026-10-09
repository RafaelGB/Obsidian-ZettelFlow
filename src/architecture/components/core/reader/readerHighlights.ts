import { Component, type App } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { anchorAll, quoteAt, type TextSpan } from "application/thinking/quoteAnchor";
import { isInk, type Thought, type ThoughtLocator, type ThoughtQuote } from "application/thinking/thought";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { activateSurface } from "architecture/plugin/services/ViewActivation";
import { chapterText, textNodes, unwrapMark, wrapSpan } from "./readerMarks";
import { crystallizeHighlight } from "architecture/components/core/library/crystallizeHighlight";
import { DEFAULT_MEANING, HIGHLIGHT_MEANINGS, meaningOf, type HighlightMeaning } from "application/thinking/highlightMeaning";
import { MOTION, fly, motionWelcome } from "./readerMotion";
import { touchPointer } from "./readerDevice";
import { markHereOn } from "./readerHere";

type LocaleKey = Parameters<typeof t>[0];

/** Where Think keeps highlights — the thought store, as far as the Reader uses it. */
export interface HighlightStore {
    folder(): string;
    highlightsAbout(notePath: string): Promise<Thought[]>;
    write(text: string, options: { about?: string; quote?: ThoughtQuote; locator?: ThoughtLocator; meaning?: HighlightMeaning }): Promise<Thought | undefined>;
    save(thought: Thought): Promise<void>;
    /** An ink note's drawing goes with it, and comes back as the answer (#745 E7). */
    discard(thought: Thought): Promise<string | undefined | void>;
    restore(thought: Thought, drawing?: string): Promise<void>;
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
    /** The chapter's ink notes (#745 E9): from the same one read, handed to the ink layer. */
    onInk?(thoughts: Thought[]): void;
    /** The ink notes' rows, beside the highlights in the margin's list. */
    renderInk?(host: HTMLElement, scope: Component): void;
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
    toNote?: (app: App, thought: Thought) => void;
}

/** The name each meaning shows (#720). A literal map, so the locale guardrail sees every key. */
const MEANING_LABEL: Record<HighlightMeaning, LocaleKey> = {
    idea: "reader_hl_meaning_idea",
    question: "reader_hl_meaning_question",
    quote: "reader_hl_meaning_quote",
    discuss: "reader_hl_meaning_discuss",
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

/** A passage, short enough for a margin line. */
function snippet(text: string, max = 140): string {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * **Highlights and notes in the margin** (#671, epic #667) — Kindle-style, and they land in Think.
 *
 * Select words in a chapter and a small popover offers *Highlight*, *Highlight and note* or *Copy*.
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
    /** Notes written in the margin of a page with no text (#681): a place, and no passage. */
    private pageNotes: Thought[] = [];
    private component: Component | null = null;
    private margin: HTMLElement | null = null;
    private anchored: { thought: Thought; marks: HTMLElement[] }[] = [];
    private detached: Thought[] = [];
    private popover: HTMLElement | null = null;
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
    /** The meaning you chose last (#720): what H keeps and what *Highlight and note* uses. */
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
        locator: ThoughtLocator | null = null
    ): Promise<void> {
        const generation = ++this.generation;
        this.hidePopover();
        this.body = body;
        this.notePath = notePath;
        this.locator = locator;
        this.pageNotes = [];
        this.component = component;
        this.margin = margin;
        this.anchored = [];
        this.tints.clear();
        this.detached = [];
        this.renderMargin();

        // The words can be selected at all only because reader.scss gives the body back the
        // `user-select: text` Obsidian's `body { user-select: none }` takes away (#667).
        component.registerDomEvent(body, "mouseup", () => this.onSelect());
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
        const here = inChapter.filter((thought) => !isInk(thought));
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
        this.pageNotes = [];
        this.anchored = [];
        this.tints.clear();
        this.detached = [];
        this.renderMargin();
    }

    /** The reader is closing. */
    dispose(): void {
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
                const row = host.createDiv({ cls: [c("reader-hl-item"), c("reader-hl-item--page")] });
                row.createDiv({ cls: c("reader-hl-note"), text: thought.text.trim() });
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
            scope.registerDomEvent(row, "click", () => this.reveal(entry.thought.id));
        }
        if (this.detached.length === 0) return;
        host.createDiv({ cls: c("reader-hl-heading"), text: t("reader_hl_detached") });
        for (const thought of this.detached) {
            const row = host.createDiv({ cls: [c("reader-hl-item"), c("reader-hl-item--detached")] });
            row.createDiv({ cls: c("reader-hl-quote"), text: snippet(thought.quote?.exact ?? "") });
            if (thought.text.trim()) row.createDiv({ cls: c("reader-hl-note"), text: thought.text.trim() });
            const open = row.createEl("button", {
                cls: c("reader-hl-link"),
                text: t("reader_hl_open_think"),
                attr: { type: "button" },
            });
            scope.registerDomEvent(open, "click", () => this.openThink(this.view.app, thought.about ?? ""));
        }
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
        const made = quoteAt(chapterText(body), start, end);
        if (!made) return null;
        const heading = this.heading(body, made.span.start);
        return { span: made.span, quote: { ...made.quote, ...(heading ? { heading } : {}) } };
    }

    private currentQuote(): { selection: SelectionInfo; span: TextSpan; quote: ThoughtQuote } | null {
        const body = this.body;
        if (!body) return null;
        const selection = this.select(body);
        if (!selection) return null;
        const found = this.quoteFor(selection.start, selection.end);
        return found ? { selection, ...found } : null;
    }

    private onSelect(): void {
        // A popover that is asking for a note keeps its place while you reach for the keyboard.
        if (this.popover?.hasClass(c("reader-hl-pop--editing"))) return;
        const found = this.currentQuote();
        if (!found) {
            if (this.popover?.hasClass(c("reader-hl-pop--select"))) this.hidePopover();
            return;
        }
        // A touch selection: below the words, beside the system's callout above them (FR-5).
        const touch = touchPointer({ pointerType: this.pointer });
        const pop = this.openPopover(found.selection.rect, "select", touch);
        // Four meanings, chosen as you mark (#720): the passage takes that colour at once.
        const meanings = pop.createDiv({ cls: c("reader-hl-meanings") });
        for (const meaning of HIGHLIGHT_MEANINGS) {
            this.meaningButton(meanings, meaning, meaning === this.lastMeaning, () => void this.keep(found.selection, found.span, found.quote, "", meaning));
        }
        const actions = pop.createDiv({ cls: c("reader-hl-actions") });
        this.button(actions, "reader_hl_highlight_note", true, () => this.openNoteEditor(found.selection, found.span, found.quote, this.lastMeaning));
        // The system's callout already offers Copy to a finger (FR-6); a mouse has only ours.
        if (touch) return;
        this.button(actions, "reader_hl_copy", false, () => {
            if (this.body) this.copy(this.body, found.quote.exact);
            this.status("reader_hl_copied");
        });
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
        await this.keepSpan(span, quote, { note, meaning, origin: "selection", clear: () => selection.clear() });
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
        const made = await this.writeHighlight(notePath, this.locator, quote, options.note ?? "", meaning);
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
        this.status(stroke ? HIGHLIGHTED[meaning] : "reader_hl_saved", options.actions?.(thought) ?? [{ key: "reader_hl_undo", run: () => void this.forget(thought, false) }], stroke);
        return thought;
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
        this.status(HIGHLIGHTED[meaning], options.actions?.(thought) ?? [{ key: "reader_hl_undo", run: () => void this.forget(thought, false) }], true);
        return thought;
    }

    /** The one write of a highlight: a thought about the note, its quote cited under its place. */
    private async writeHighlight(notePath: string, locator: ThoughtLocator | null, quote: ThoughtQuote, note: string, meaning: HighlightMeaning): Promise<Thought | undefined> {
        let made: Thought | undefined;
        // In a source, the place is the heading a passage is cited under when its page has none.
        const cited = locator && !quote.heading && locator.label ? { ...quote, heading: locator.label } : quote;
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-highlight", label: notePath }, async () => {
                made = await this.store.write(note.trim(), { about: notePath, quote: cited, ...(locator ? { locator } : {}), meaning });
            });
        } catch (error) {
            log.error(`[Reader] could not keep a highlight on ${notePath}: ${String(error)}`);
        }
        return made;
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
    async extend(thought: Thought, span: TextSpan, options: Pick<KeepOptions, "direction" | "actions"> = {}): Promise<Thought | undefined> {
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
        const next: Thought = { ...thought, quote };
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
        this.decorate(next, added);
        entry.thought = next;
        entry.marks.push(...added);
        this.extensions.set(next, { marks: added, tint });
        this.renderMargin();
        this.view.onChange();
        this.status(HIGHLIGHTED[meaning], options.actions?.(next) ?? [], true);
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
        this.hidePopover();
        return true;
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
                made = await this.store.write(text.trim(), { about: notePath, locator });
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
        this.status("reader_hl_page_saved", [{ key: "reader_hl_undo", run: () => void this.forgetPageNote(thought) }]);
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
            this.hidePopover();
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

    /** A click on a highlight: its note, and what you can do with it. */
    private openMark(id: string, mark: HTMLElement): void {
        const entry = this.anchored.find((candidate) => candidate.thought.id === id);
        if (!entry) return;
        const thought = entry.thought;
        const rect = mark.getBoundingClientRect();
        const pop = this.openPopover({ left: rect.left, top: rect.top, width: rect.width }, "mark");
        const note = thought.text.trim();
        pop.createDiv({ cls: c(note ? "reader-hl-pop-note" : "reader-hl-pop-empty"), text: note || t("reader_hl_no_note") });
        // What it means, changed in place (#720).
        const meanings = pop.createDiv({ cls: c("reader-hl-meanings") });
        for (const meaning of HIGHLIGHT_MEANINGS) {
            this.meaningButton(meanings, meaning, meaning === meaningOf(thought), () => void this.changeMeaning(thought, meaning));
        }
        const actions = pop.createDiv({ cls: c("reader-hl-actions") });
        this.button(actions, note ? "reader_hl_edit_note" : "reader_hl_add_note", true, () => {
            const editing = this.openPopover({ left: rect.left, top: rect.top, width: rect.width }, "editing");
            this.noteForm(editing, note, (text) => void this.editNote(thought, text));
        });
        // A passage of a book or a paper becomes a note that cites its page (#683).
        if (thought.locator) {
            this.button(actions, "reader_hl_crystallize", false, () => {
                this.hidePopover();
                this.toNote(this.view.app, thought);
            });
        }
        this.button(actions, "reader_hl_delete", false, () => void this.forget(thought));
        this.button(actions, "reader_hl_open_think", false, () => {
            this.hidePopover();
            this.openThink(this.view.app, thought.about ?? this.notePath ?? "");
        });
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

    /** One meaning as a swatch and its name; the one in use is marked. */
    private meaningButton(parent: HTMLElement, meaning: HighlightMeaning, on: boolean, run: () => void): HTMLElement {
        const button = parent.createEl("button", {
            cls: [c("reader-hl-meaning"), c(`reader-hl-meaning--${meaning}`), ...(on ? ["is-active"] : [])],
            attr: { type: "button", "aria-pressed": String(on), "data-meaning": meaning },
        });
        button.createSpan({ cls: [c("reader-hl-swatch"), c(`reader-hl-swatch--${meaning}`)] });
        button.createSpan({ text: t(MEANING_LABEL[meaning]) });
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
            const button = this.button(pop, action.key, false, () => {
                // One way back, once: the others go with it.
                buttons.forEach((b) => b.setAttribute("disabled", "true"));
                action.run();
            });
            buttons.push(button);
        }
        this.statusTimer = ownWindow(this.view.host)?.setTimeout(() => {
            if (this.popover === pop) this.hidePopover();
        }, STATUS_MS);
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
