import { Component, type App } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { anchorAll, quoteAt, type TextSpan } from "application/thinking/quoteAnchor";
import type { Thought, ThoughtQuote } from "application/thinking/thought";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { activateSurface } from "architecture/plugin/services/ViewActivation";
import { chapterText, textNodes, unwrapMark, wrapSpan } from "./readerMarks";

type LocaleKey = Parameters<typeof t>[0];

/** Where Think keeps highlights — the thought store, as far as the Reader uses it. */
export interface HighlightStore {
    folder(): string;
    highlightsAbout(notePath: string): Promise<Thought[]>;
    write(text: string, options: { about?: string; quote?: ThoughtQuote }): Promise<Thought | undefined>;
    save(thought: Thought): Promise<void>;
    discard(thought: Thought): Promise<void>;
    restore(thought: Thought): Promise<void>;
}

/** What the current selection covers, in chapter-text offsets, and where it is on screen. */
export interface SelectionInfo {
    start: number;
    end: number;
    rect: { left: number; top: number; width: number };
    clear(): void;
}

/** The parts of the view the highlights draw into and act through. */
export interface HighlightView {
    app: App;
    /** Where the popover floats: the reader's root, positioned. */
    host: HTMLElement;
    /** What lives as long as the reader does. */
    owner: Component;
    /** Bring an element of the chapter into view, inside the reader's own scroller. */
    scrollTo(el: HTMLElement): void;
    /** Something changed that a panel might show. */
    onChange(): void;
}

/** Seams for tests; the defaults are the real DOM and the real thought store. */
export interface HighlightDeps {
    store?: HighlightStore;
    selection?: (body: HTMLElement) => SelectionInfo | null;
    headingAt?: (body: HTMLElement, offset: number) => string | undefined;
    makeMark?: (id: string) => HTMLElement;
    openThink?: (app: App, notePath: string) => void;
    copy?: (body: HTMLElement, text: string) => void;
}

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
        rect: { left: rect.left, top: rect.top, width: rect.width },
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

    private body: HTMLElement | null = null;
    private notePath: string | null = null;
    private component: Component | null = null;
    private margin: HTMLElement | null = null;
    private anchored: { thought: Thought; marks: HTMLElement[] }[] = [];
    private detached: Thought[] = [];
    private popover: HTMLElement | null = null;
    /** The listeners of the popover on screen, gone with it. */
    private popoverScope: Component | null = null;
    /** The listeners of the margin's rows, replaced when it redraws. */
    private marginScope: Component | null = null;
    private statusTimer: number | undefined;
    /** Bumped on every chapter, so a slow load never draws over a newer one. */
    private generation = 0;

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
    async attach(body: HTMLElement, notePath: string, component: Component, margin: HTMLElement | null): Promise<void> {
        const generation = ++this.generation;
        this.hidePopover();
        this.body = body;
        this.notePath = notePath;
        this.component = component;
        this.margin = margin;
        this.anchored = [];
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
                }, 350);
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
        const text = chapterText(body);
        const { anchored, detached } = anchorAll(
            text,
            thoughts.filter((thought) => thought.quote).map((thought) => ({ thought, quote: thought.quote! }))
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
        this.anchored = [];
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

    /** Scroll to a highlight and make it flash, when a deep link asked for one. */
    reveal(id: string): boolean {
        const entry = this.anchored.find((candidate) => candidate.thought.id === id);
        // An embed that re-rendered drops the marks drawn in it: only a live one can be shown.
        const mark = entry?.marks.find((m) => m.isConnected !== false);
        if (!entry || !mark) return false;
        this.view.scrollTo(mark);
        entry.marks.forEach((m) => m.addClass(c("reader-highlight--flash")));
        return true;
    }

    /** H: highlight what is selected now. Returns whether there was anything to keep. */
    highlightCurrent(withNote = false): boolean {
        const found = this.currentQuote();
        if (!found) return false;
        if (withNote) this.openNoteEditor(found.selection, found.span, found.quote);
        else void this.keep(found.selection, found.span, found.quote, "");
        return true;
    }

    hidePopover(): void {
        window.clearTimeout(this.statusTimer);
        this.popover?.remove();
        this.popover = null;
        this.popoverScope?.unload();
        this.popoverScope = null;
    }

    /** The highlights as a list — the margin's content, and the context panel's on a narrow pane. */
    renderList(host: HTMLElement, scope: Component): void {
        if (this.anchored.length === 0 && this.detached.length === 0) return;
        host.createDiv({ cls: c("reader-hl-heading"), text: t("reader_hl_margin") });
        for (const entry of this.anchored) {
            const row = host.createEl("button", { cls: c("reader-hl-item"), attr: { type: "button" } });
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

    // ── selection ────────────────────────────────────────────────────────────

    private currentQuote(): { selection: SelectionInfo; span: TextSpan; quote: ThoughtQuote } | null {
        const body = this.body;
        if (!body) return null;
        const selection = this.select(body);
        if (!selection) return null;
        const made = quoteAt(chapterText(body), selection.start, selection.end);
        if (!made) return null;
        const heading = this.heading(body, made.span.start);
        return { selection, span: made.span, quote: { ...made.quote, ...(heading ? { heading } : {}) } };
    }

    private onSelect(): void {
        // A popover that is asking for a note keeps its place while you reach for the keyboard.
        if (this.popover?.hasClass(c("reader-hl-pop--editing"))) return;
        const found = this.currentQuote();
        if (!found) {
            if (this.popover?.hasClass(c("reader-hl-pop--select"))) this.hidePopover();
            return;
        }
        const pop = this.openPopover(found.selection.rect, "select");
        const actions = pop.createDiv({ cls: c("reader-hl-actions") });
        this.button(actions, "reader_hl_highlight", true, () => void this.keep(found.selection, found.span, found.quote, ""));
        this.button(actions, "reader_hl_highlight_note", false, () => this.openNoteEditor(found.selection, found.span, found.quote));
        this.button(actions, "reader_hl_copy", false, () => {
            if (this.body) this.copy(this.body, found.quote.exact);
            this.status("reader_hl_copied");
        });
    }

    private openNoteEditor(selection: SelectionInfo, span: TextSpan, quote: ThoughtQuote): void {
        const pop = this.openPopover(selection.rect, "editing");
        this.noteForm(pop, "", (text) => void this.keep(selection, span, quote, text));
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

    private async keep(selection: SelectionInfo, span: TextSpan, quote: ThoughtQuote, note: string): Promise<void> {
        const notePath = this.notePath;
        const body = this.body;
        if (!notePath || !body) return;
        if (!this.store.folder()) {
            this.status("reader_hl_no_lab");
            return;
        }
        let made: Thought | undefined;
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-highlight", label: notePath }, async () => {
                made = await this.store.write(note.trim(), { about: notePath, quote });
            });
        } catch (error) {
            log.error(`[Reader] could not keep a highlight on ${notePath}: ${String(error)}`);
        }
        if (!made) {
            this.status("reader_hl_failed");
            return;
        }
        this.made++;
        if (note.trim()) this.noted++;
        selection.clear();
        if (this.body !== body) return; // the chapter turned while the thought was written
        const thought = made;
        const marks = this.draw(thought, span);
        // A marker drawn across the words, once — only on the highlight just made (#667).
        marks.forEach((mark) => mark.addClass(c("reader-highlight--new")));
        this.insert(thought, marks, span.start);
        this.status("reader_hl_saved", () => void this.forget(thought, false));
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
    private async forget(thought: Thought, offerUndo = true): Promise<void> {
        try {
            await withWriteBatch({ kind: "manual", ref: "reader-highlight", label: thought.about ?? "" }, () =>
                this.store.discard(thought)
            );
        } catch (error) {
            log.error(`[Reader] could not remove a highlight: ${String(error)}`);
            this.status("reader_hl_failed");
            return;
        }
        const entry = this.anchored.find((candidate) => candidate.thought.id === thought.id);
        entry?.marks.forEach((mark) => unwrapMark(mark));
        this.anchored = this.anchored.filter((candidate) => candidate.thought.id !== thought.id);
        this.detached = this.detached.filter((candidate) => candidate.id !== thought.id);
        this.renderMargin();
        this.view.onChange();
        if (offerUndo) this.status("reader_hl_removed", () => void this.bringBack(thought));
        else {
            // Taking back the highlight just made: it no longer counts for this reading.
            this.made = Math.max(0, this.made - 1);
            if (thought.text.trim()) this.noted = Math.max(0, this.noted - 1);
            this.hidePopover();
        }
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
        const marks = wrapSpan(body, span, () => this.makeMark(thought.id)) as unknown as HTMLElement[];
        if (thought.text.trim()) marks.forEach((mark) => mark.addClass(c("reader-highlight--noted")));
        for (const mark of marks) {
            this.component?.registerDomEvent(mark, "click", (event: MouseEvent) => {
                // Inside a link the mark wins: its popover, not the link's peek or navigation.
                event.preventDefault();
                event.stopPropagation();
                this.openMark(thought.id, mark);
            });
        }
        return marks;
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
        const actions = pop.createDiv({ cls: c("reader-hl-actions") });
        this.button(actions, note ? "reader_hl_edit_note" : "reader_hl_add_note", true, () => {
            const editing = this.openPopover({ left: rect.left, top: rect.top, width: rect.width }, "editing");
            this.noteForm(editing, note, (text) => void this.editNote(thought, text));
        });
        this.button(actions, "reader_hl_delete", false, () => void this.forget(thought));
        this.button(actions, "reader_hl_open_think", false, () => {
            this.hidePopover();
            this.openThink(this.view.app, thought.about ?? this.notePath ?? "");
        });
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

    private openPopover(rect: SelectionInfo["rect"], mode: "select" | "editing" | "mark" | "status"): HTMLElement {
        this.hidePopover();
        const host = this.view.host;
        const pop = host.createDiv({
            cls: [c("reader-hl-pop"), c(`reader-hl-pop--${mode}`)],
            attr: { role: "dialog", "aria-label": t("reader_hl_label") },
        });
        const box = host.getBoundingClientRect();
        // Positioned by two custom properties the stylesheet reads — no inline layout.
        pop.setCssProps?.({
            "--zf-hl-x": `${Math.round(rect.left + rect.width / 2 - box.left)}px`,
            "--zf-hl-y": `${Math.round(rect.top - box.top)}px`,
        });
        const scope = new Component();
        scope.load();
        this.popoverScope = scope;
        // Clicks inside the popover must not count as a new selection in the chapter.
        scope.registerDomEvent(pop, "mousedown", (event: MouseEvent) => event.stopPropagation());
        this.popover = pop;
        return pop;
    }

    /** One line that says what happened, with its Undo when there is one, then goes. */
    private status(key: LocaleKey, undo?: () => void): void {
        const rect = this.popover?.getBoundingClientRect();
        const box = this.view.host.getBoundingClientRect();
        const where = rect
            ? { left: rect.left + rect.width / 2, top: rect.top + rect.height, width: 0 }
            : { left: box.left + box.width / 2, top: box.top + box.height / 2, width: 0 };
        const pop = this.openPopover(where, "status");
        pop.setAttribute("role", "status");
        pop.createSpan({ cls: c("reader-hl-status"), text: t(key) });
        if (undo) {
            const button = this.button(pop, "reader_hl_undo", false, () => {
                button.setAttribute("disabled", "true");
                undo();
            });
        }
        this.statusTimer = window.setTimeout(() => {
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
