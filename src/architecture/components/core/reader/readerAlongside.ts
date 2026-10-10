import { Component, TFile, type App, type TAbstractFile } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import {
    alongsideLenses,
    alongsideVocabulary,
    allOf,
    chapterVerdict,
    LENSES,
    nearPassage,
    ruledOutGaps,
    ruledOutInChapter,
    withNamed,
    type AlongsideItem,
    type AlongsideThought,
    type AlongsideWhy,
    type BornNote,
    type Judgement,
    type Lens,
    type Vocabulary,
} from "architecture/knowledge/state";
import { KnowledgeIndex, type KnowledgeModel } from "architecture/knowledge";
import { JudgementLog, type JudgementEntry } from "architecture/plugin/judgement/JudgementLog";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { hoverPreview } from "architecture/components/core/a11y";
import { notesBornFrom } from "application/library/born";
import { placeLabel, readSourceEntry, sourceTitle } from "application/library/provenance";
import { sourceFormat } from "application/library/sourceMeta";
import { isHighlight, thoughtPath, type Thought } from "application/thinking/thought";
import { flightTransform, MOTION, motionWelcome } from "./readerMotion";
import { reconcile, type Reconciled } from "./readerFlip";

/**
 * **Alongside — your vault beside the page** (#754, epic #741).
 *
 * The Reader's context panel, empowered: the same button and the same place, for a book, a paper or
 * a note reading. It holds your highlights on this page first, as it always did, and under them what
 * of yours is **near** the paragraph you are reading — named in it, born from it, marked in it —
 * through six lenses (`architecture/knowledge/alongside`). Every card says why it is there, in one
 * line; there is no score and no count.
 *
 * - It follows your reading **when the scrolling settles** (`ALONGSIDE_SETTLE_MS`), never per frame.
 * - Switching a lens, or reading on, moves the cards (`readerFlip`) — what stays keeps its place.
 *   While the pointer is in the panel, nothing moves under it.
 * - A click reads a card as a peek and the page does not move; a tension offers *Look at both* (a
 *   peek under the paragraph) and *Not related* (one verdict in the judgement record, for this
 *   chapter, with *Undo* in place).
 * - **It writes no note.** The one write is the verdict, and a structural test holds the line.
 * - Whether it is open and the lens you chose are kept on this device, never in the vault.
 */

/** How long the reading must be still before Alongside follows it (FR-2, AC-8). */
export const ALONGSIDE_SETTLE_MS = 150;
/** How long *Undo* stays in a card's place after *Not related* (FR-9). */
export const UNDO_MS = 5000;
/** How many cards a lens shows before *Show more* (FR-7). */
export const ALONGSIDE_SHOW = 5;
/** Where the panel's state lives: this device only, beside the reading pace (FR-13). */
export const ALONGSIDE_STORAGE_KEY = "zettelflow-reader-alongside";

type LocaleKey = Parameters<typeof t>[0];
export type LensId = "all" | Lens;
export const LENS_IDS: readonly LensId[] = ["all", ...LENSES];

/** Literal maps, so the locale guardrail sees every key. */
const LENS_KEY: Record<LensId, LocaleKey> = {
    all: "reader_lens_all",
    connections: "reader_lens_connections",
    contradictions: "reader_lens_contradictions",
    questions: "reader_lens_questions",
    knowledge: "reader_lens_knowledge",
    research: "reader_lens_research",
    unripe: "reader_lens_unripe",
};

export type NearKind = "paragraph" | "selection" | "page";
const NEAR_KEY: Record<NearKind, LocaleKey> = {
    paragraph: "reader_near_paragraph",
    selection: "reader_near_selection",
    page: "reader_near_page",
};
const EMPTY_KEY: Record<NearKind, LocaleKey> = {
    paragraph: "reader_alongside_empty",
    selection: "reader_alongside_empty_selection",
    page: "reader_alongside_empty_page",
};
const NAMED_KEY: Record<NearKind, LocaleKey> = {
    paragraph: "reader_why_named",
    selection: "reader_why_named_selection",
    page: "reader_why_named_page",
};
const WHY_KEY: Record<Exclude<AlongsideWhy, "named" | "born-chapter">, LocaleKey> = {
    "born-book": "reader_why_born_book",
    mark: "reader_why_highlight",
    linked: "reader_why_linked",
    shared: "reader_why_shared",
    contradicts: "reader_why_contradicts",
    question: "reader_why_question",
    claim: "reader_why_claim",
    cites: "reader_why_cites",
    unsourced: "reader_why_unsourced",
    highlight: "reader_why_highlight",
    thought: "reader_why_thought",
};

/** What is being read, as Alongside needs it. */
export interface AlongsideReading {
    /** The book or paper; in a note reading, the reading's seed. */
    book: string;
    bookTitle: string;
    /** The chapter on screen (#751's key); in a note reading, its note. */
    chapterKey: string;
    /** A PDF or an EPUB, rather than a reading of notes. */
    source: boolean;
    /** In a note reading, the note on screen. */
    chapterNote?: string;
}

/** The passage Alongside is near: its words, and the block it is in on the page. */
export interface AlongsidePassage {
    text: string;
    kind: NearKind;
    anchor: HTMLElement | null;
}

/** What the Reader lends Alongside. */
export interface AlongsideView {
    app: App;
    /** The view: timers and vault listeners live as long as it does. */
    owner: Component;
    reading(): AlongsideReading | null;
    passage(): AlongsidePassage | null;
    /** Your highlights and margin notes in the chapter on screen. */
    marks(): readonly Thought[];
    /** Draw the chapter's highlights list (the panel always held it, FR-1). */
    renderHighlights(host: HTMLElement, scope: Component): void;
    peek(anchor: HTMLElement, path: string, name: string): void;
}

interface IndexLike {
    readonly status: string;
    getModel(): KnowledgeModel;
}

interface JudgementsLike {
    entries(): Judgement[];
    record(entry: JudgementEntry): Judgement | null;
    remove(entry: Judgement): void;
}

/** Seams for tests: the index, Think's thoughts, the judgement record. */
export interface AlongsideDeps {
    index?: IndexLike;
    thoughts?: () => Promise<Thought[]>;
    thoughtFolder?: () => string;
    judgements?: JudgementsLike;
}

interface CardParts {
    tag: HTMLElement;
    title: HTMLElement;
    why: HTMLElement;
    actions: HTMLElement;
    slot: HTMLElement;
}

interface Kept {
    open: boolean;
    lens: LensId;
}

const basename = (path: string) => (path.split("/").pop() ?? path).replace(/\.md$/i, "");
const WIKILINK = /\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]/g;

function snippet(text: string, max = 120): string {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function readKept(app: App): Kept {
    const raw = (app?.loadLocalStorage?.(ALONGSIDE_STORAGE_KEY) ?? {}) as { open?: unknown; lens?: unknown };
    const lens = (LENS_IDS as readonly unknown[]).includes(raw.lens) ? (raw.lens as LensId) : "all";
    return { open: raw.open === true, lens };
}

export class ReaderAlongside {
    private readonly index: IndexLike;
    private readonly loadThoughts: () => Promise<Thought[]>;
    private readonly thoughtFolder: () => string;
    private readonly judgements: JudgementsLike;
    private kept: Kept;

    private host: HTMLElement | null = null;
    private scope: Component | null = null;
    private els: { near: HTMLElement; chips: HTMLElement; marks: HTMLElement; state: HTMLElement; list: HTMLElement; more: HTMLElement } | null = null;
    private readonly cards = new WeakMap<HTMLElement, CardParts>();
    /** The items now drawn, by key: a card's listeners read the item through here. */
    private readonly items = new Map<string, AlongsideItem>();
    private lenses: Record<Lens, AlongsideItem[]> | null = null;
    private all: AlongsideItem[] = [];
    private nearKind: NearKind = "paragraph";
    private passageAnchor: HTMLElement | null = null;
    private state: "indexing" | "failed" | "ready" = "indexing";
    private expanded = false;
    private timer: number | undefined;
    private pointerInside = false;
    private held = false;
    private flip: Reconciled | null = null;
    private marker: Animation | null = null;
    /** The highlights list's listeners: replaced with it, never piled onto the panel's scope. */
    private marksScope: Component | null = null;
    /** What the heading said last: it is a live region, and says it again only when it changes. */
    private nearShown: NearKind | null = null;
    /** Think's thoughts, read once per reading and again when the thinking folder changes. */
    private thoughts: Thought[] | null = null;
    private thoughtsLoading = false;
    private named: { vocabulary: Vocabulary; thoughts: AlongsideThought[] } | null = null;
    private born: { model: KnowledgeModel; revision: number; book: string; notes: BornNote[] } | null = null;
    /** Ruled out this session, by `book#chapter` — so a verdict holds even with the record turned off. */
    private readonly ruled = new Map<string, Set<string>>();
    /** The *Undo* in a card's place: what it takes back, and when it goes. */
    private undo: { key: string; path: string; entry: Judgement | null; chapter: string; timer: number } | null = null;
    /** The next draw's leave or arrive: a card set aside, or brought back. */
    private nextMove: { leave?: "aside"; arrive?: "aside" } = {};

    constructor(
        private readonly view: AlongsideView,
        deps: AlongsideDeps = {}
    ) {
        this.index = deps.index ?? KnowledgeIndex.getInstance();
        this.loadThoughts = deps.thoughts ?? (() => ThoughtStore.getInstance().all());
        this.thoughtFolder = deps.thoughtFolder ?? (() => ThoughtStore.getInstance().folder());
        this.judgements = deps.judgements ?? JudgementLog.getInstance();
        this.kept = readKept(view.app);
        this.watchThoughts();
    }

    /** Whether Alongside was open when you last read on this device (FR-13). */
    wasOpen(): boolean {
        return this.kept.open;
    }

    lens(): LensId {
        return this.kept.lens;
    }

    /** Remember whether it is open, on this device. */
    remember(open: boolean): void {
        if (this.kept.open === open) return;
        this.kept = { ...this.kept, open };
        this.keep();
    }

    private keep(): void {
        this.view.app?.saveLocalStorage?.(ALONGSIDE_STORAGE_KEY, { open: this.kept.open, lens: this.kept.lens });
    }

    /** Whether the panel drawn in `host` is this one, still standing. */
    isMounted(host: HTMLElement): boolean {
        return this.host === host && this.els !== null && host.contains(this.els.list);
    }

    /** Draw the panel into `host`, its listeners on `scope`, and fill it now. */
    mount(host: HTMLElement, scope: Component): void {
        this.host = host;
        this.scope = scope;
        this.items.clear();
        this.expanded = false;
        this.flip = null;
        this.pointerInside = false;
        this.held = false;
        this.nearShown = null;
        const head = host.createDiv({ cls: c("reader-alongside-head") });
        head.createDiv({ cls: c("reader-panel-title"), text: t("reader_context") });
        const near = head.createDiv({ cls: c("reader-alongside-near"), attr: { "aria-live": "polite" } });
        const chips = host.createDiv({ cls: c("reader-alongside-lenses"), attr: { role: "group", "aria-label": t("reader_alongside_lenses") } });
        for (const id of LENS_IDS) {
            const active = id === this.kept.lens;
            const chip = chips.createEl("button", {
                cls: [c("reader-alongside-lens"), ...(active ? ["is-active"] : [])],
                attr: { type: "button", "aria-pressed": String(active), "data-zf-lens": id },
                text: t(LENS_KEY[id]),
            });
            if (active) chip.createSpan({ cls: c("reader-lens-marker"), attr: { "aria-hidden": "true" } });
            scope.registerDomEvent(chip, "click", () => this.choose(id));
        }
        const marks = host.createDiv({ cls: c("reader-alongside-marks") });
        const state = host.createDiv({ cls: [c("reader-alongside-state"), c("reader-hidden")] });
        const list = host.createDiv({ cls: c("reader-alongside-list"), attr: { tabindex: "-1", "aria-label": t("reader_context") } });
        const more = host.createEl("button", { cls: [c("reader-alongside-more"), c("reader-hidden")], attr: { type: "button" }, text: t("reader_alongside_more") });
        scope.registerDomEvent(more, "click", () => {
            this.expanded = true;
            this.draw();
        });
        // Nothing moves under the pointer (FR-19): a settled reading waits until it leaves.
        scope.registerDomEvent(host, "pointerenter", () => {
            this.pointerInside = true;
        });
        scope.registerDomEvent(host, "pointerleave", () => {
            this.pointerInside = false;
            if (this.held) {
                this.held = false;
                this.draw();
            }
        });
        // Input during a move jumps it to its end (FR-22).
        scope.registerDomEvent(host, "pointerdown", () => this.finish());
        scope.registerDomEvent(host, "keydown", () => this.finish());
        this.els = { near, chips, marks, state, list, more };
        this.drawMarks();
        this.refresh();
    }

    /** The reading moved on (a chapter turned, a highlight was made): redraw the marks and follow. */
    update(): void {
        this.drawMarks();
        this.schedule();
    }

    /** Follow the reading once it settles: the last call wins, `ALONGSIDE_SETTLE_MS` after it (AC-8). */
    schedule(): void {
        if (!this.els) return;
        const win = this.win();
        win.clearTimeout(this.timer);
        this.timer = win.setTimeout(() => {
            this.timer = undefined;
            this.refresh(true);
        }, ALONGSIDE_SETTLE_MS);
    }

    /** Jump any move to its end. */
    finish(): void {
        this.flip?.finish();
        this.flip = null;
        try {
            this.marker?.finish();
        } catch {
            // Already done.
        }
        this.marker = null;
    }

    /** The panel is gone: its timers with it. */
    unmount(): void {
        this.finish();
        this.pointerInside = false;
        this.held = false;
        this.marksScope?.unload();
        this.marksScope = null;
        this.win().clearTimeout(this.timer);
        this.timer = undefined;
        this.dropUndo();
        this.host = null;
        this.scope = null;
        this.els = null;
        this.items.clear();
    }

    dispose(): void {
        this.unmount();
    }

    private win(): Window {
        return this.host?.win ?? window;
    }

    // ── what is near ─────────────────────────────────────────────────────────

    /**
     * Compute what is near the passage now, and draw it. A refresh that follows your reading waits
     * while the pointer is in the panel (FR-19); one you asked for — a verdict, its undo — does not.
     */
    refresh(following = false): void {
        const els = this.els;
        if (!els) return;
        const reading = this.view.reading();
        if (!reading) return;
        if (this.index.status !== "ready") {
            this.state = "indexing";
            this.lenses = null;
            this.all = [];
            this.draw();
            return;
        }
        try {
            const model = this.index.getModel();
            const vocabulary = alongsideVocabulary(model);
            const passage = this.view.passage();
            this.nearKind = passage?.kind ?? "paragraph";
            this.passageAnchor = passage?.anchor ?? null;
            // An *Undo* belongs to the chapter it was offered in: turning the page takes it away.
            if (this.undo && this.undo.chapter !== `${reading.book}#${reading.chapterKey}`) this.dropUndo();
            const history = this.judgements.entries();
            const ruledOut = this.ruledOut(reading, history);
            const marks = this.view.marks().map((thought) => this.toAlongside(thought));
            const near = nearPassage(model, vocabulary, {
                text: passage?.text ?? "",
                ...(reading.source ? { book: reading.book, bookTitle: reading.bookTitle, chapterKey: reading.chapterKey, born: this.bornOf(model, reading.book) } : {}),
                ...(reading.chapterNote ? { chapterNote: reading.chapterNote } : {}),
                marks,
                ruledOut,
            });
            const gaps = ruledOutGaps(history);
            this.lenses = alongsideLenses(model, near, {
                vocabulary,
                ...(reading.source ? { book: reading.book } : {}),
                ...(reading.chapterNote ? { chapterNote: reading.chapterNote } : {}),
                thoughts: this.thoughtsFor(vocabulary),
                ruledOut,
                ruledOutGap: (a, b) => gaps.has(a, b),
            });
            this.all = allOf(this.lenses);
            this.state = "ready";
        } catch (error) {
            log.warn(`[Reader] Alongside could not read the vault: ${error instanceof Error ? error.message : String(error)}`);
            this.state = "failed";
            this.lenses = null;
            this.all = [];
        }
        if (following) this.expanded = false;
        if (following && this.pointerInside) {
            // The heading may say where you are; the cards wait for the pointer to leave.
            this.held = true;
            this.drawNear();
            return;
        }
        this.draw();
    }

    private ruledOut(reading: AlongsideReading, history: Judgement[]): Set<string> {
        const out = ruledOutInChapter(history, reading.book, reading.chapterKey);
        for (const path of this.ruled.get(`${reading.book}#${reading.chapterKey}`) ?? []) out.add(path);
        return out;
    }

    /** The notes born from this book, and where in it each says it came from (#751). Once per revision. */
    private bornOf(model: KnowledgeModel, book: string): BornNote[] {
        const held = this.born;
        if (held && held.model === model && held.revision === model.revision() && held.book === book) return held.notes;
        const notes: BornNote[] = [];
        const name = basename(book);
        for (const path of notesBornFrom(model.all()).get(book) ?? []) {
            const file = this.view.app.vault?.getAbstractFileByPath?.(path);
            const front = file instanceof TFile ? this.view.app.metadataCache?.getFileCache?.(file)?.frontmatter : undefined;
            const values = front ? [front.source, front.sources].flat() : [];
            const place = values.map((value) => readSourceEntry(value)).find((entry) => entry && (entry.file === book || basename(entry.file) === name));
            notes.push({ path, ...(place?.chapter ? { chapterKey: place.chapter } : {}), ...(place ? { label: placeLabel(place) } : {}) });
        }
        this.born = { model, revision: model.revision(), book, notes };
        return notes;
    }

    /** A thought as Alongside reads it: its words, the notes its links resolve to, where it lives. */
    private toAlongside(thought: Thought): AlongsideThought {
        const folder = this.thoughtFolder();
        const file = folder ? thoughtPath(folder, thought) : undefined;
        const links: { to: string }[] = [];
        for (const match of thought.text.matchAll(WIKILINK)) {
            const target = this.view.app.metadataCache?.getFirstLinkpathDest?.(match[1].trim(), file ?? "");
            if (target?.path && !links.some((link) => link.to === target.path)) links.push({ to: target.path });
        }
        const about = thought.about;
        return {
            id: thought.id,
            text: thought.text,
            ...(about ? { about, aboutTitle: sourceFormat(about) ? sourceTitle(about) : basename(about) } : {}),
            links,
            highlight: isHighlight(thought),
            ...(thought.meaning ? { meaning: thought.meaning } : {}),
            title: snippet(thought.quote?.exact || thought.text) || basename(file ?? thought.id),
            ...(file ? { file } : {}),
        };
    }

    /** Think's thoughts, with the notes each names read once per vocabulary. Loaded on first use. */
    private thoughtsFor(vocabulary: Vocabulary): AlongsideThought[] {
        if (!this.thoughts) {
            if (!this.thoughtsLoading) {
                this.thoughtsLoading = true;
                void this.readThink();
            }
            return [];
        }
        if (!this.named || this.named.vocabulary !== vocabulary) {
            this.named = { vocabulary, thoughts: withNamed(vocabulary, this.thoughts.map((thought) => this.toAlongside(thought))) };
        }
        return this.named.thoughts;
    }

    private async readThink(): Promise<void> {
        try {
            this.thoughts = await this.loadThoughts();
            this.named = null;
            this.schedule();
        } catch (error) {
            log.debug(`[Reader] Alongside could not read Think: ${String(error)}`);
        } finally {
            this.thoughtsLoading = false;
        }
    }

    /** A thought written, changed or deleted in the thinking folder: read Think again on the next settle. */
    private watchThoughts(): void {
        const vault = this.view.app?.vault;
        if (typeof vault?.on !== "function") return;
        const changed = (file: TAbstractFile) => {
            const folder = this.thoughtFolder();
            if (!folder || !file?.path?.startsWith(`${folder}/`)) return;
            this.thoughts = null;
            this.named = null;
            if (this.els) this.schedule();
        };
        for (const ref of [vault.on("create", changed), vault.on("modify", changed), vault.on("delete", changed)]) {
            if (ref) this.view.owner.registerEvent(ref);
        }
    }

    // ── drawing ──────────────────────────────────────────────────────────────

    private drawMarks(): void {
        const els = this.els;
        if (!els) return;
        els.marks.empty();
        this.marksScope?.unload();
        const scope = new Component();
        scope.load();
        this.marksScope = scope;
        this.view.renderHighlights(els.marks, scope);
    }

    private drawNear(): void {
        if (!this.els || this.nearShown === this.nearKind) return;
        this.nearShown = this.nearKind;
        this.els.near.setText(t(NEAR_KEY[this.nearKind]));
    }

    private shown(): AlongsideItem[] {
        if (!this.lenses) return [];
        return this.kept.lens === "all" ? this.all : this.lenses[this.kept.lens];
    }

    /** Draw the cards of the lens now chosen, moving rather than redrawing (FR-18, FR-19). */
    private draw(): void {
        const els = this.els;
        if (!els) return;
        this.drawNear();
        const items = this.shown();
        const visible = this.expanded ? items : items.slice(0, ALONGSIDE_SHOW);
        let line: LocaleKey | null = null;
        if (this.state === "indexing") line = "reader_alongside_indexing";
        else if (this.state === "failed") line = "reader_alongside_failed";
        else if (this.all.length === 0) line = EMPTY_KEY[this.nearKind];
        else if (items.length === 0 && !this.undo) line = "reader_alongside_lens_empty";
        els.state.setText(line ? t(line) : "");
        els.state.toggleClass(c("reader-hidden"), line === null);
        els.more.toggleClass(c("reader-hidden"), this.expanded || items.length <= ALONGSIDE_SHOW);
        els.list.toggleClass(c("reader-alongside-list--all"), this.kept.lens === "all");

        this.items.clear();
        for (const item of visible) this.items.set(item.key, item);
        const keys = visible.map((item) => item.key);
        const undo = this.undo;
        if (undo) {
            const at = this.undoIndex(undo.key, keys);
            keys.splice(at, 0, `undo:${undo.key}`);
        }
        const move = this.nextMove;
        this.nextMove = {};
        this.flip = reconcile(els.list, keys, (key) => (key.startsWith("undo:") ? this.drawUndo(els.list) : this.drawCard(els.list, key)), move);
        for (const card of Array.from(els.list.children) as HTMLElement[]) {
            const key = card.getAttribute("data-zf-key");
            const item = key ? this.items.get(key) : undefined;
            if (item) this.fill(card, item);
        }
    }

    /** Where *Undo* stands: the place the card it took back had. */
    private undoAt = 0;
    private undoIndex(key: string, keys: readonly string[]): number {
        const at = keys.indexOf(key);
        return at >= 0 ? at : Math.min(this.undoAt, keys.length);
    }

    private drawCard(list: HTMLElement, key: string): HTMLElement {
        const card = list.createDiv({ cls: c("reader-alongside-card") });
        const tag = card.createDiv({ cls: c("reader-alongside-tag") });
        const title = card.createEl("button", { cls: c("reader-alongside-title"), attr: { type: "button" } });
        const why = card.createDiv({ cls: c("reader-alongside-why") });
        const actions = card.createDiv({ cls: [c("reader-alongside-actions"), c("reader-hidden")] });
        const both = actions.createEl("button", { cls: c("reader-alongside-action"), attr: { type: "button" }, text: t("reader_look_at_both") });
        const not = actions.createEl("button", { cls: [c("reader-alongside-action"), c("reader-alongside-action--quiet")], attr: { type: "button" }, text: t("reader_not_related") });
        const slot = card.createDiv({ cls: c("reader-alongside-slot") });
        this.cards.set(card, { tag, title, why, actions, slot });
        // The card's own listeners live on the card: a card the list lets go takes them with it,
        // rather than piling onto the panel's scope for as long as Alongside stays open.
        // A click reads it, in a peek; the page stays where it is (FR-8).
        title.addEventListener("click", () => {
            const item = this.items.get(key);
            if (item?.path) this.view.peek(slot, item.path, item.thought ? item.title : basename(item.path));
        });
        // A tension's two questions (FR-9).
        both.addEventListener("click", () => {
            const item = this.items.get(key);
            if (item) this.view.peek(this.passageAnchor ?? slot, item.path, basename(item.path));
        });
        not.addEventListener("click", () => {
            const item = this.items.get(key);
            if (item) this.notRelated(item);
        });
        if (key.startsWith("note:")) hoverPreview(this.view.app, title, key.slice("note:".length), this.scope ?? this.view.owner);
        return card;
    }

    private fill(card: HTMLElement, item: AlongsideItem): void {
        const parts = this.cards.get(card);
        if (!parts) return;
        parts.tag.setText(t(LENS_KEY[item.lens]));
        parts.tag.setAttribute("data-zf-lens", item.lens);
        parts.title.setText(item.title);
        parts.why.setText(this.whyOf(item));
        parts.actions.toggleClass(c("reader-hidden"), !item.tension);
        const [both, not] = Array.from(parts.actions.children) as HTMLElement[];
        both?.setAttribute("aria-label", t("reader_look_at_both_label", item.title));
        not?.setAttribute("aria-label", t("reader_not_related_label", item.title));
    }

    /** Why a card is here, in one line (FR-4). */
    private whyOf(item: AlongsideItem): string {
        if (item.why === "named") return t(NAMED_KEY[this.nearKind]);
        if (item.why === "born-chapter") return item.detail ? t("reader_why_born_page", item.detail) : t("reader_why_born_chapter");
        return t(WHY_KEY[item.why], item.detail ?? "");
    }

    // ── lenses ───────────────────────────────────────────────────────────────

    /** Choose a lens: its fill travels to it, the cards move (FR-18), and the choice is kept here. */
    private choose(id: LensId): void {
        const els = this.els;
        if (!els || id === this.kept.lens) return;
        this.finish();
        this.kept = { ...this.kept, lens: id };
        this.keep();
        this.expanded = false;
        const chips = Array.from(els.chips.children) as HTMLElement[];
        const marker = els.chips.querySelector<HTMLElement>(`.${c("reader-lens-marker")}`);
        const from = marker?.getBoundingClientRect();
        for (const chip of chips) {
            const active = chip.getAttribute("data-zf-lens") === id;
            chip.toggleClass("is-active", active);
            chip.setAttribute("aria-pressed", String(active));
            if (active && marker) chip.appendChild(marker);
        }
        if (marker && from && motionWelcome(marker)) {
            const to = marker.getBoundingClientRect();
            this.marker = marker.animate([{ transform: flightTransform(to, from) }, { transform: "translate(0px, 0px) scale(1, 1)" }], { duration: MOTION.fast, easing: MOTION.ease });
        }
        this.draw();
    }

    // ── not related ──────────────────────────────────────────────────────────

    /** *Not related* (FR-9, FR-20): one verdict for this chapter, the card set aside, *Undo* in its place. */
    private notRelated(item: AlongsideItem): void {
        const reading = this.view.reading();
        if (!reading || !item.path) return;
        this.dropUndo();
        const chapter = `${reading.book}#${reading.chapterKey}`;
        const entry = this.judgements.record(chapterVerdict(item.path, reading.book, reading.chapterKey));
        const set = this.ruled.get(chapter) ?? new Set<string>();
        set.add(item.path);
        this.ruled.set(chapter, set);
        this.undoAt = Math.max(0, this.shown().findIndex((other) => other.key === item.key));
        const timer = this.win().setTimeout(() => {
            if (this.undo?.key !== item.key) return;
            const focused = this.focusInUndo();
            this.undo = null;
            this.draw();
            if (focused) this.els?.list.focus();
        }, UNDO_MS);
        this.undo = { key: item.key, path: item.path, entry, chapter, timer };
        this.nextMove = { leave: "aside" };
        this.refresh();
        // The button you pressed is going: your place is the Undo that stands where it was.
        this.els?.list.querySelector(`.${c("reader-alongside-undo")}`)?.querySelector<HTMLElement>("button")?.focus();
    }

    private drawUndo(list: HTMLElement): HTMLElement {
        const row = list.createDiv({ cls: [c("reader-alongside-card"), c("reader-alongside-undo")] });
        row.createSpan({ cls: c("reader-alongside-why"), text: t("reader_not_related_done") });
        const button = row.createEl("button", { cls: c("reader-alongside-action"), attr: { type: "button" }, text: t("reader_not_related_undo") });
        button.addEventListener("click", () => this.takeBack());
        return row;
    }

    /** *Undo*: the verdict withdrawn, the card back by the reverse move. */
    private takeBack(): void {
        const undo = this.undo;
        if (!undo) return;
        this.win().clearTimeout(undo.timer);
        this.undo = null;
        if (undo.entry) this.judgements.remove(undo.entry);
        this.ruled.get(undo.chapter)?.delete(undo.path);
        this.nextMove = { arrive: "aside" };
        this.refresh();
        const back = Array.from(this.els?.list.children ?? []).find((el) => el.getAttribute("data-zf-key") === undo.key);
        (back?.querySelector<HTMLElement>(`.${c("reader-alongside-title")}`) ?? this.els?.list)?.focus();
    }

    private focusInUndo(): boolean {
        const row = this.els?.list.querySelector(`.${c("reader-alongside-undo")}`);
        const active = (row)?.doc?.activeElement ?? null;
        return Boolean(row && active && row.contains(active));
    }

    private dropUndo(): void {
        if (!this.undo) return;
        this.win().clearTimeout(this.undo.timer);
        this.undo = null;
    }
}
