import {
    Component,
    ItemView,
    Keymap,
    MarkdownRenderer,
    Scope,
    TFile,
    setIcon,
    type Modifier,
    type ViewStateResult,
    type WorkspaceLeaf,
} from "obsidian";
import { c, log } from "architecture";
import { t, tCount } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import { buildEvidenceMap, type ChapterRole, type ReadingPath } from "architecture/knowledge/state";
import { READER_VIEW, parseReaderState, type ReaderKind } from "./readerContract";
import { pathFor } from "./readerPaths";
import { isNoteLink, noteExcerpt, JumpStack } from "./readerJumps";
import { MOTION, motionWelcome, playCoverFlight } from "./readerMotion";
import { matchesIn, searchBook, type SearchResult } from "./readerSearch";
import { readableText, readableWithMap, unwrapMark, wrapSpan } from "./readerMarks";
import { stripFrontmatter } from "./readerDocument";
import { KIND_KEY } from "./readerLabels";
import { renderEndCard, renderSourceEnd, type EndCard } from "./readerEnd";
import { ReadingExportModal, type ExportResult } from "./readerExport";
import { normalizeSaved, saveReading, savedId } from "./readerSaved";
import { readFrom } from "./readingChooser";
import { undoBatch } from "architecture/plugin/writes/undoNotice";
import { activateSurface } from "architecture/plugin/services/ViewActivation";
import { normalizeResume, readingKey, recordResume } from "./readerResume";
import type { ReaderHost } from "./readerHost";
import { adoptHeldSides, exitReader, heldSides, restoreWorkspace } from "./openReader";
import { addToReading, placeInPath, plainExcerpt, popDetour, pushDetour } from "./readerDetours";
import { hoverPreview } from "architecture/components/core/a11y";
import { ReaderHighlights, type HighlightDeps } from "./readerHighlights";
import { chapterOfHighlight, keptScroll, rememberSourceFacts, rememberSourcePlace, rememberSourceScroll, sourceMetaOf, sourceReading } from "./readerSource";
import { resumeScroll } from "application/library/sourceMeta";
import { openSourceDocument, type SourceDocument, type SourceLayout } from "architecture/components/core/library/sources/sourceDocument";
import { openLibrary } from "architecture/components/core/library/openLibrary";
import { END_OF_CHAPTER, bookMinutesLeft, learnPace, minutesFor, minutesLeft, normalizePace, paceWpm, readFraction, scrolls, splitMinutes, wordCount, type Pace } from "./readerPace";
import {
    READER_FONTS,
    READER_SIZES,
    READER_THEMES,
    normalizeReaderPrefs,
    readerClassNames,
    type ReaderPrefs,
} from "./readerPrefs";

type LocaleKey = Parameters<typeof t>[0];

/** The bar fades after this long without a pointer move or a key. */
const IDLE_MS = 2000;

/** A source longer than this reads without the chapter dots: three hundred pages are not dots. */
const DOTS_LIMIT = 40;

/** The leaving fade (`reader--leaving` in reader.scss); the workspace comes back when it ends. */
const EXIT_MS = 220;
/** How long the way back from a jump stays on screen before it fades (#718); Alt+← keeps working. */
const JUMP_PILL_MS = 8000;
/** Where your reading pace is kept — Obsidian's per-device local storage, never synced (#722). */
const PACE_STORAGE_KEY = "zettelflow-reader-pace";
/** How long after you stop scrolling the place inside a chapter is kept. */
const SCROLL_SAVE_MS = 800;
/** A second landing on a resumed chapter, once its pictures have moved the page. */
const RESUME_SETTLE_MS = 600;
/** A pause in typing before the book is searched (#719). */
const SEARCH_DEBOUNCE_MS = 150;
/** Results listed under the search bar; the bar counts them all. */
const SEARCH_LIST_LIMIT = 60;

/**
 * The keys, as the shortcuts sheet lists them. A cap is a locale key (a word: Space, Esc) or the
 * literal glyph on the key (→, H, ?).
 */
const SHORTCUTS: { keys: string[]; label: LocaleKey }[] = [
    { keys: ["→"], label: "reader_key_next" },
    { keys: ["←"], label: "reader_key_previous" },
    { keys: ["reader_kbd_space"], label: "reader_key_page" },
    { keys: ["reader_kbd_shift", "reader_kbd_space"], label: "reader_key_page_back" },
    { keys: ["reader_kbd_home", "reader_kbd_end"], label: "reader_key_ends" },
    { keys: ["H"], label: "reader_key_highlight" },
    { keys: ["1–4"], label: "reader_key_meaning" },
    { keys: ["reader_kbd_shift", "H"], label: "reader_key_note" },
    { keys: ["F"], label: "reader_key_fullscreen" },
    { keys: ["V"], label: "reader_key_layout" },
    { keys: ["reader_kbd_mod", "F"], label: "reader_key_search" },
    { keys: ["reader_kbd_alt", "←"], label: "reader_key_back" },
    { keys: ["?"], label: "reader_key_help" },
    { keys: ["reader_kbd_esc"], label: "reader_key_exit" },
];

/** Literal map, so the locale guardrail sees every key cap the sheet draws. */
const KBD_KEY: Record<string, LocaleKey> = {
    reader_kbd_space: "reader_kbd_space",
    reader_kbd_shift: "reader_kbd_shift",
    reader_kbd_home: "reader_kbd_home",
    reader_kbd_end: "reader_kbd_end",
    reader_kbd_esc: "reader_kbd_esc",
    reader_kbd_mod: "reader_kbd_mod",
    reader_kbd_alt: "reader_kbd_alt",
};

/** Whether a key went to something you type in — a margin note, a save name — and is not ours. */
function isTyping(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable === true;
}

const ROLE_KEY: Record<ChapterRole, LocaleKey> = {
    thesis: "reader_role_thesis",
    support: "reader_role_support",
    counter: "reader_role_counter",
    synthesis: "reader_role_synthesis",
    context: "reader_role_context",
};

/** Literal maps, so the locale guardrail sees every key the type panel draws. */
const FONT_KEY: Record<ReaderPrefs["font"], LocaleKey> = { sans: "reader_font_sans", serif: "reader_font_serif" };
const SIZE_KEY: Record<ReaderPrefs["size"], LocaleKey> = {
    small: "reader_size_small",
    medium: "reader_size_medium",
    large: "reader_size_large",
};
const THEME_KEY: Record<ReaderPrefs["theme"], LocaleKey> = {
    auto: "reader_theme_auto",
    light: "reader_theme_light",
    sepia: "reader_theme_sepia",
    dark: "reader_theme_dark",
};

export type { ReaderHost };


type Panel = "contents" | "type" | "context" | null;

/** A note's body without its frontmatter: the properties are not part of what you read. */
export const readableBody = stripFrontmatter;

function noteName(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/**
 * **The Reader** (#668, epic #667) — read a path across your notes, the way you read a book.
 *
 * Its own view, opened in the main area while the sidebars fold away (see `openReader`), and closed
 * with the workspace given back. A chapter is a note rendered by Obsidian's own Markdown renderer,
 * so embeds, callouts and the theme behave as they do everywhere else.
 *
 * **It writes no note.** Reading is the whole job; a structural test holds the line.
 */
export class ReaderView extends ItemView {
    private path: ReadingPath | null = null;
    /** How the reading was chosen, and a picked set's order — what the view state keeps. */
    private kind: ReaderKind = "around";
    private paths: string[] | undefined;
    private index = 0;
    private prefs: ReaderPrefs;
    private panel: Panel = null;
    private root: HTMLElement | null = null;
    private els: {
        title: HTMLElement;
        page: HTMLElement;
        dots: HTMLElement;
        label: HTMLElement;
        progress: HTMLProgressElement;
        panel: HTMLElement;
        stage: HTMLElement;
        margin: HTMLElement;
        hairline: HTMLElement;
        minutes: HTMLElement;
        /** Page view ↔ reading view, shown for a PDF that has text (#681). */
        layout: HTMLElement;
        /** Search inside the book (#719), shown for a book or a paper. */
        search: HTMLElement;
    } | null = null;
    /** Words in the chapter on screen, for the minutes left. */
    private chapterWords = 0;
    /** Your reading pace, learned on this device only (#722). */
    private pace: Pace | null = null;
    /** When the chapter on screen opened, and whether you reached its end: one sample of your pace. */
    private chapterOpenedAt = Date.now();
    private reachedEnd = false;
    /** Words of the chapters drawn in this reading, for the time left in the book. */
    private readonly seenWords = new Map<number, number>();
    /** The end-of-chapter card: the next chapter's name and length, lit when you reach it. */
    private nextCard: HTMLElement | null = null;
    /** Which way the next page turns: forward, back, or 0 for a reading that just opened. */
    private turn: 1 | -1 | 0 = 0;
    /** The leaving fade is playing; a second Esc or × does not start another. */
    private leaving = false;
    /** The keyboard shortcuts sheet, while it is open. */
    private shortcuts: HTMLElement | null = null;
    /** Highlights and margin notes (#671): drawn over each chapter, kept as thoughts in Think. */
    private highlights: ReaderHighlights | null = null;
    /** A highlight a deep link asked to land on — consumed by the next chapter that holds it. */
    private pendingHighlight: string | null = null;
    /** The listeners and renders of the chapter on screen; replaced with it. */
    private chapter: Component | null = null;
    /** The listeners of the dots and the rest of one render — dropped with the next (#667 audit). */
    private renderScope: Component | null = null;
    /** The listeners of the open panel's rows, replaced when it redraws. */
    private panelScope: Component | null = null;
    /** The listeners of the open peek, gone with it. */
    private peekScope: Component | null = null;
    /**
     * A restored reading that waits for the index (#667 audit): before layout-ready the model is
     * empty, so its path would be the seed alone and its place would be lost. Kept until it can be read.
     */
    private pending: { seed: string; chapter: number } | null = null;
    private idleTimer: number | undefined;
    /** Bumped on every chapter change, so a slow read never draws over a newer chapter. */
    private generation = 0;
    /**
     * Notes read as detours from the chapter, deepest last (#670). Session only: a reload returns
     * you to the chapter, which is where the reading is.
     */
    private detours: string[] = [];
    /** Chapters you have been on in this reading, for the contents' ticks. */
    private readonly visited = new Set<string>();
    /** The open peek, if any — drawn inline under the block holding the link. */
    private peek: HTMLElement | null = null;
    /** Bumped on every peek, so a slow excerpt never lands in a newer one. */
    private peekGeneration = 0;
    private pill: HTMLElement | null = null;
    /** Where you were before each jump inside a book (#718): the pill and Alt+← return there. */
    private readonly jumps = new JumpStack<{ chapter: number; top: number; label: string }>();
    /** The jump pill goes away by itself; the way back stays on Alt+←. */
    private jumpPillTimer: number | undefined;
    private jumpPillShown = false;
    /** A scroll to restore once the chapter a Back returns to is drawn. */
    private pendingTop: number | null = null;
    /** How far into the chapter a resume lands, once it is drawn (a share of it, 0–1). */
    private pendingShare: number | null = null;
    private scrollSaveTimer: number | undefined;
    /** The footnote read in place (#718), and its listeners. */
    private notePop: HTMLElement | null = null;
    private notePopScope: Component | null = null;
    /** Search inside the book (#719): the bar, the book's text read once, and the results. */
    private searchEl: HTMLElement | null = null;
    private searchInput: HTMLInputElement | null = null;
    private searchCount: HTMLElement | null = null;
    private searchList: HTMLElement | null = null;
    private searchScope: Component | null = null;
    private searchTexts: string[] | null = null;
    private searchBuilding: Promise<string[] | null> | null = null;
    private searchResult: SearchResult | null = null;
    private searchAt = -1;
    private searchMarks: HTMLElement[] = [];
    /** The next drawn chapter brings the current match into view. */
    private searchReveal = false;
    private searchTimer: number | undefined;
    /** The reading is over and its end card is on screen (#672). */
    private ended = false;
    /** When this reading began, for the end card's minutes. */
    private startedAt = Date.now();
    /** Detours taken in this reading — counted, never kept. */
    private detourCount = 0;
    /** A saved reading's name, or the name it was just saved under (#672). */
    private name: string | undefined;
    private savedId: string | undefined;
    /** The last export's outcome, with its Open and Undo, while the end card is up. */
    private endStatus: EndCard["status"];
    /**
     * A PDF or an EPUB being read (#681, #682): its chapters are its pages or spine items. The path
     * is known at once; the document once it has been opened.
     */
    private sourcePath: string | null = null;
    private source: SourceDocument | null = null;
    private sourceFailed = false;
    private sourceLayout: SourceLayout = "reading";
    /** Bumped on every source opened, so a slow open never lands in a newer reading. */
    private sourceGeneration = 0;

    constructor(
        leaf: WorkspaceLeaf,
        private readonly plugin?: ReaderHost,
        /** Seams for tests: the thought store, the selection, the mark factory. */
        private readonly highlightDeps: HighlightDeps = {}
    ) {
        super(leaf);
        this.prefs = normalizeReaderPrefs(plugin?.settings?.readerPrefs);
        this.pace = normalizePace(this.app?.loadLocalStorage?.(PACE_STORAGE_KEY));
        // Obsidian's way (#667): the active leaf's scope gets the keys, wherever focus is, and only
        // the keys it registers — Ctrl/Cmd/Alt combinations fall through to the app's hotkeys.
        this.scope = new Scope(this.app?.scope);
        this.registerKeys(this.scope);
    }

    /** A literal: `ItemView` calls this from its own constructor, before any field exists (#278). */
    getViewType(): string {
        return "zettelflow-reader";
    }

    getDisplayText(): string {
        if (this.sourcePath) return `${t("reader_title")} · ${this.source?.title ?? noteName(this.sourcePath)}`;
        return this.path ? `${t("reader_title")} · ${noteName(this.path.seed)}` : t("reader_title");
    }

    getIcon(): string {
        return "book-open";
    }

    getState(): Record<string, unknown> {
        const base = super.getState();
        const sides = heldSides();
        if (this.sourcePath) {
            return {
                ...base,
                source: this.sourcePath,
                chapter: this.index,
                ...(this.sourceLayout === "page" ? { layout: "page" } : {}),
                ...(sides ? { restore: sides } : {}),
            };
        }
        return {
            ...base,
            ...(this.pending
                ? { seed: this.pending.seed, chapter: this.pending.chapter }
                : this.path
                  ? { seed: this.path.seed, chapter: this.index }
                  : {}),
            ...(this.path && this.kind !== "around" ? { kind: this.kind } : {}),
            ...(this.paths ? { paths: this.paths } : {}),
            ...(this.name ? { name: this.name } : {}),
            ...(sides ? { restore: sides } : {}),
        };
    }

    async setState(state: unknown, result: ViewStateResult): Promise<void> {
        await super.setState(state, result);
        const parsed = parseReaderState(state);
        if (parsed.restore) adoptHeldSides(parsed.restore);
        if (parsed.highlight) this.pendingHighlight = parsed.highlight;
        if (parsed.source) {
            await this.readSource(parsed.source, parsed.chapter ?? 0, parsed.layout === "page" ? "page" : "reading", parsed.highlight);
            if (this.els) this.render();
            return;
        }
        if (parsed.seed && this.sourcePath) this.leaveSource();
        if (parsed.seed) {
            // A new reading: its own clock, counts and end.
            if (parsed.seed !== this.path?.seed || (parsed.kind ?? "around") !== this.kind) {
                this.startedAt = Date.now();
                this.detourCount = 0;
                this.visited.clear();
            this.seenWords.clear();
            this.chapterOpenedAt = Date.now();
            this.reachedEnd = false;
                this.savedId = undefined;
                this.endStatus = undefined;
            }
            this.ended = false;
            // Whatever was on screen belongs to the previous reading: its detour and its peek too.
            this.detours = [];
            this.closePeek();
            this.name = parsed.name;
            this.kind = parsed.kind ?? "around";
            this.paths = parsed.kind === "selection" ? parsed.paths : undefined;
            this.path = pathFor(this.app, parsed.seed, this.kind, this.paths);
            const chapter = parsed.chapter ?? 0;
            if (this.kind !== "selection" && KnowledgeIndex.getInstance().status !== "ready") {
                // Restored before the index is built: keep the place, read it once the model is there.
                this.pending = { seed: parsed.seed, chapter };
                this.index = 0;
            } else {
                this.pending = null;
                this.index = Math.max(0, Math.min(chapter, this.path.chapters.length - 1));
            }
        }
        if (this.els) this.render();
    }

    /**
     * Read a PDF or an EPUB (#681, #682). The reading is the source; its place is kept by the
     * Library. A highlight a deep link names is landed on, whichever page it is on.
     */
    private async readSource(path: string, chapter: number, layout: SourceLayout, highlight?: string): Promise<void> {
        const fresh = path !== this.sourcePath;
        if (fresh) {
            this.leaveSource();
            this.startedAt = Date.now();
            this.detourCount = 0;
            this.visited.clear();
            this.savedId = undefined;
            this.endStatus = undefined;
            this.sourcePath = path;
            this.jumps.clear();
            // Back where you were inside the chapter, not at its top — unless a highlight was asked for.
            this.pendingShare = highlight ? null : keptScroll(this.plugin, path, chapter);
        }
        this.ended = false;
        this.detours = [];
        this.closePeek();
        this.pending = null;
        this.name = undefined;
        this.kind = "around";
        this.paths = undefined;
        this.sourceLayout = layout;
        this.index = Math.max(0, chapter);
        if (!this.source) {
            // Something to show at once: the source, opening.
            this.path = { seed: path, kind: "selection", chapters: [{ path, role: "context" }] };
            const generation = ++this.sourceGeneration;
            try {
                const doc = await openSourceDocument(this.app, path, sourceMetaOf(this.plugin, path)?.imageOnly);
                if (generation !== this.sourceGeneration || this.sourcePath !== path) {
                    doc.close();
                    return;
                }
                this.source = doc;
                this.sourceFailed = false;
                this.path = sourceReading(doc);
                rememberSourceFacts(this.app, this.plugin, doc);
            } catch (error) {
                log.error(`[Reader] could not open ${path}: ${error instanceof Error ? error.message : String(error)}`);
                this.sourceFailed = true;
            }
        }
        if (highlight) {
            const at = await chapterOfHighlight(path, highlight, this.highlightDeps.store);
            if (at !== null) this.index = at;
        }
        this.index = Math.max(0, Math.min(this.index, (this.path?.chapters.length ?? 1) - 1));
    }

    /** Close the source being read, before another reading takes its place. */
    private leaveSource(): void {
        this.closeSearch();
        this.searchTexts = null;
        this.searchBuilding = null;
        this.sourceGeneration++;
        this.source?.close();
        this.source = null;
        this.sourcePath = null;
        this.sourceFailed = false;
        this.sourceLayout = "reading";
    }

    /** Page view ↔ reading view, for a PDF (#681). The place is kept. */
    private toggleLayout(): void {
        if (!this.source?.hasPageView) return;
        this.sourceLayout = this.sourceLayout === "page" ? "reading" : "page";
        this.app.workspace.requestSaveLayout();
        this.render();
    }

    /** Read a reading that waited for the index, now that the model can say what its path is. */
    private resolvePending(): void {
        const pending = this.pending;
        if (!pending || KnowledgeIndex.getInstance().status !== "ready") return;
        this.pending = null;
        this.path = pathFor(this.app, pending.seed, this.kind, this.paths);
        this.index = Math.max(0, Math.min(pending.chapter, this.path.chapters.length - 1));
        if (this.els) this.render();
    }

    /**
     * Obsidian focuses a leaf by asking it for focus here — reused or restored, the reader must
     * take the keys itself, or ← → Space and Esc reach nothing until you click the page.
     */
    setEphemeralState(state: unknown): void {
        super.setEphemeralState(state);
        if ((state as { focus?: boolean } | null)?.focus) this.contentEl.focus({ preventScroll: true });
    }

    async onOpen(): Promise<void> {
        this.buildShell();
        // The cover clicked on the shelf opens into this page, before anything else moves (#724).
        if (this.root && this.els) playCoverFlight(this.root, this.els.stage);
        this.contentEl.setAttribute("tabindex", "-1");
        this.registerDomEvent(this.contentEl, "mousemove", () => this.wake());
        // A reading restored before the index is ready is read as soon as the model is built.
        this.app.workspace.onLayoutReady?.(() => this.resolvePending());
        const resolved = this.app.metadataCache.on?.("resolved", () => this.resolvePending());
        if (resolved) this.registerEvent(resolved);
        this.render();
        this.contentEl.focus({ preventScroll: true });
    }

    async onClose(): Promise<void> {
        window.clearTimeout(this.idleTimer);
        this.leaveSource();
        this.highlights?.dispose();
        this.chapter?.unload();
        this.chapter = null;
        this.renderScope?.unload();
        this.renderScope = null;
        this.panelScope?.unload();
        this.panelScope = null;
        this.peekScope?.unload();
        this.peekScope = null;
        // Closing the tab any other way still gives the workspace back.
        restoreWorkspace(this.app);
        this.contentEl.empty();
        this.els = null;
        this.root = null;
    }

    // ── shell ────────────────────────────────────────────────────────────────

    private buildShell(): void {
        this.contentEl.empty();
        this.contentEl.addClass(c("reader-host"));
        const root = this.contentEl.createDiv();
        this.root = root;
        this.applyPrefs();

        const top = root.createDiv({ cls: c("reader-top") });
        const title = top.createDiv({ cls: c("reader-path-title") });
        const close = top.createEl("button", {
            cls: ["clickable-icon", c("reader-exit")].join(" "),
            attr: { type: "button", "aria-label": t("reader_exit") },
        });
        setIcon(close, "x");
        this.registerDomEvent(close, "click", () => this.exit());
        // How far through the chapter you are: a hairline across the top, filled by the scroll.
        const hairline = root.createDiv({ cls: c("reader-hairline"), attr: { "aria-hidden": "true" } });
        hairline.createDiv({ cls: c("reader-hairline-fill") });

        // The way back from a detour (#670): one press pops one level.
        const pill = root.createEl("button", {
            cls: [c("reader-detour-pill"), c("reader-hidden")].join(" "),
            attr: { type: "button" },
        });
        // The same pill is the way back from a jump inside a book (#718).
        this.registerDomEvent(pill, "click", () => (this.detours.length > 0 ? this.backFromDetour() : this.backFromJump()));
        this.pill = pill;

        const stage = root.createDiv({ cls: c("reader-stage") });
        // A selection popover belongs to the words it floats over; scrolling them away puts it away.
        this.registerDomEvent(stage, "scroll", () => {
            this.highlights?.onScroll();
            this.closeNote();
            this.onStageScroll();
        });
        // A peek is read in place; clicking elsewhere puts it away.
        this.registerDomEvent(root, "mousedown", (event) => {
            const target = event.target as HTMLElement | null;
            if (this.peek && target && !this.peek.contains(target) && !target.closest?.("a.internal-link")) this.closePeek();
            if (this.notePop && target && !this.notePop.contains(target)) this.closeNote();
        });
        const page = stage.createEl("article", { cls: c("reader-page") });
        // Kindle's margin (#671): the chapter's highlights and notes, beside the page on a wide pane.
        const margin = stage.createEl("aside", { cls: c("reader-margin"), attr: { "aria-label": t("reader_hl_margin") } });
        const dots = root.createDiv({ cls: c("reader-dots"), attr: { role: "tablist", "aria-label": t("reader_contents") } });

        const bar = root.createDiv({ cls: c("reader-bar"), attr: { role: "toolbar", "aria-label": t("reader_title") } });
        this.iconButton(bar, "chevron-left", "reader_previous", () => this.go(-1));
        const label = bar.createSpan({ cls: c("reader-bar-label") });
        const progress = bar.createEl("progress", { cls: c("reader-progress") });
        const minutes = bar.createSpan({ cls: [c("reader-bar-minutes"), c("reader-hidden")].join(" ") });
        this.iconButton(bar, "chevron-right", "reader_next", () => this.go(1));
        bar.createSpan({ cls: c("reader-bar-sep") });
        this.iconButton(bar, "list", "reader_contents", () => this.toggle("contents"));
        const search = this.iconButton(bar, "search", "reader_search", () => void this.openSearch());
        search.addClass(c("reader-hidden"));
        this.iconButton(bar, "type", "reader_type", () => this.toggle("type"));
        this.iconButton(bar, "git-fork", "reader_context", () => this.toggle("context"));
        const layout = this.iconButton(bar, "file-image", "reader_source_page_view", () => this.toggleLayout());
        layout.addClass(c("reader-hidden"));
        this.iconButton(bar, "maximize", "reader_fullscreen", () => this.toggleFullscreen());
        this.iconButton(bar, "keyboard", "reader_shortcuts", () => this.toggleShortcuts());

        const panel = root.createDiv({ cls: c("reader-panel") });
        this.els = { title, page, dots, label, progress, panel, stage, margin, hairline, minutes, layout, search };
        this.highlights = new ReaderHighlights(
            {
                app: this.app,
                host: root,
                owner: this,
                scrollTo: (el) => this.scrollToEl(el),
                onChange: () => {
                    if (this.panel === "context") this.renderPanel();
                },
            },
            this.highlightDeps
        );
        this.wake();
    }

    private iconButton(parent: HTMLElement, icon: string, key: LocaleKey, onClick: () => void): HTMLElement {
        const button = parent.createEl("button", {
            cls: ["clickable-icon", c("reader-bar-button")].join(" "),
            attr: { type: "button", "aria-label": t(key) },
        });
        setIcon(button, icon);
        this.registerDomEvent(button, "click", onClick);
        return button;
    }

    private applyPrefs(): void {
        if (!this.root) return;
        const { plugin, obsidian } = readerClassNames(this.prefs);
        const idle = this.root.hasClass?.(c("reader--idle")) ?? false;
        const fromCover = this.root.hasClass?.(c("reader--from-cover")) ?? false;
        this.root.className = [...plugin.map((name) => c(name)), ...obsidian, ...(idle ? [c("reader--idle")] : []), ...(fromCover ? [c("reader--from-cover")] : [])].join(" ");
    }

    private savePrefs(next: ReaderPrefs): void {
        if (next.theme !== this.prefs.theme) this.crossFadeTheme();
        this.prefs = next;
        this.applyPrefs();
        if (this.plugin?.settings) {
            this.plugin.settings.readerPrefs = next;
            void this.plugin.saveSettings?.();
        }
        if (this.panel === "type") this.renderPanel();
    }

    /**
     * Day, sepia, night (#724): the new theme fades in under a veil of the old one, instead of
     * snapping. Only opacity moves; the text never does.
     */
    private crossFadeTheme(): void {
        const root = this.root;
        if (!root || !motionWelcome(root)) return;
        const background = root.win.getComputedStyle?.(root).backgroundColor;
        if (!background) return;
        const veil = root.createDiv({ cls: c("reader-theme-veil"), attr: { "aria-hidden": "true" } });
        veil.setCssProps({ "--zf-veil": background });
        const done = () => veil.remove();
        veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.base, easing: MOTION.ease, fill: "forwards" }).onfinish = done;
        root.win.setTimeout(done, MOTION.base + 300);
    }

    // ── chapters ─────────────────────────────────────────────────────────────

    private render(): void {
        if (!this.els) return;
        const els = this.els;
        const path = this.path;
        if (this.sourcePath) {
            const doc = this.source;
            els.title.setText(doc ? [doc.title, doc.author].filter(Boolean).join(" · ") : noteName(this.sourcePath));
        } else {
            els.title.setText(path ? (this.name ?? `${noteName(path.seed)} · ${t(KIND_KEY[this.kind])}`) : t("reader_title"));
        }
        const pageView = this.sourceLayout === "page";
        els.layout.toggleClass(c("reader-hidden"), !this.source?.hasPageView);
        els.search.toggleClass(c("reader-hidden"), !this.sourcePath);
        els.layout.toggleClass("is-active", Boolean(this.source?.hasPageView) && pageView);
        els.layout.setAttribute("aria-label", t(pageView ? "reader_source_reading_view" : "reader_source_page_view"));
        els.layout.setAttribute("aria-pressed", String(pageView));
        const total = path?.chapters.length ?? 0;
        els.label.setText(this.ended ? t("reader_finished") : total ? t("reader_chapter_label", String(this.index + 1), String(total)) : "");
        els.progress.max = Math.max(1, total);
        els.progress.value = this.ended ? total : total ? this.index + 1 : 0;

        els.dots.empty();
        // A book of three hundred pages is not three hundred dots: the bar's count says where you are.
        els.dots.toggleClass(c("reader-hidden"), Boolean(this.sourcePath) && total > DOTS_LIMIT);
        this.renderScope?.unload();
        const scope = new Component();
        scope.load();
        this.renderScope = scope;
        if (!this.sourcePath || total <= DOTS_LIMIT) path?.chapters.forEach((chapter, i) => {
            const dot = els.dots.createEl("button", {
                cls: [c("reader-dot"), ...(i < this.index || this.ended ? [c("reader-dot--done")] : []), ...(i === this.index && !this.ended ? [c("reader-dot--current")] : [])].join(" "),
                attr: {
                    type: "button",
                    role: "tab",
                    "aria-selected": String(i === this.index),
                    "aria-label": t("reader_dot_label", String(i + 1), this.source?.chapters[i]?.label ?? noteName(chapter.path)),
                },
            });
            scope.registerDomEvent(dot, "click", () => this.show(i));
        });
        this.renderPill();
        if (this.ended) this.renderEnd();
        else void this.renderChapter();
        if (this.panel) this.renderPanel();
    }

    private async renderChapter(): Promise<void> {
        if (this.sourcePath) return this.renderSourceChapter();
        if (!this.els || !this.path) return;
        const generation = ++this.generation;
        const { page, stage } = this.els;
        const chapter = this.path.chapters[this.index];
        const detour = this.detours[this.detours.length - 1];
        const reading = detour ?? chapter.path;
        if (!detour) this.visited.add(chapter.path);
        this.closePeek();
        // The last chapter's highlights must not show in a panel while this one renders.
        this.highlights?.reset();
        this.chapter?.unload();
        const component = new Component();
        component.load();
        this.chapter = component;

        page.empty();
        this.turnPage(page);
        this.chapterWords = 0;
        this.nextCard = null;
        const total = this.path.chapters.length;
        page.createDiv({
            cls: c("reader-count"),
            text: detour ? t("reader_detour") : `${String(this.index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
        });
        page.createDiv({ cls: c("reader-role") }).createSpan({
            cls: [c("reader-role-tag"), c(`reader-role-tag--${detour ? "detour" : chapter.role}`)].join(" "),
            text: detour ? t("reader_detour") : t(ROLE_KEY[chapter.role]),
        });
        page.createEl("h1", { cls: c("reader-chapter-title"), text: noteName(reading) });
        const body = page.createDiv({ cls: ["markdown-rendered", c("reader-body")].join(" ") });
        stage.scrollTop = 0;
        this.onStageScroll();
        // Before the render, and in the capture phase: an embed's own link handler would otherwise
        // open the note in another tab — or create it, when the link is unresolved — before ours ran.
        component.registerDomEvent(body, "click", (event) => this.onLink(event), { capture: true });
        component.registerDomEvent(body, "auxclick", (event) => this.onLink(event), { capture: true });

        const file = this.app.vault.getAbstractFileByPath(reading);
        if (!(file instanceof TFile)) {
            body.createDiv({ cls: c("reader-missing"), text: t("reader_missing") });
        } else {
            try {
                const markdown = await this.app.vault.cachedRead(file);
                if (generation !== this.generation) return;
                // Raw: Obsidian's renderer hides the frontmatter itself — stripping it here too would
                // eat a `---` rule that opens the body.
                await MarkdownRenderer.render(this.app, markdown, body, file.path, component);
            } catch (error) {
                log.error(`[Reader] could not render ${reading}: ${error instanceof Error ? error.message : String(error)}`);
                body.createDiv({ cls: c("reader-missing"), text: t("reader_missing") });
            }
        }
        if (generation !== this.generation) return;
        this.chapterWords = wordCount(body.textContent ?? "");
        this.seenWords.set(this.index, this.chapterWords);
        this.watchFocus(body, component);
        // The note's highlights, found again by their words; a deep link lands on one (#671).
        void this.highlights?.attach(body, reading, component, this.els?.margin ?? null).then(() => {
            if (generation !== this.generation || !this.pendingHighlight) return;
            if (this.highlights?.reveal(this.pendingHighlight)) this.pendingHighlight = null;
        });
        // Obsidian's own page preview on every link it drew, as on every note name the plugin draws (#594).
        for (const link of Array.from(body.querySelectorAll("a.internal-link"))) {
            const href = link.getAttribute("data-href");
            const target = href ? this.app.metadataCache.getFirstLinkpathDest(href.split("#")[0], reading) : null;
            if (target) hoverPreview(this.app, link as HTMLElement, target.path, component);
        }

        const card = page.createDiv({ cls: c("reader-next") });
        // The chapter's end, quietly (#724): an ornament that fades in as you arrive. No number.
        card.createDiv({ cls: c("reader-ornament"), attr: { "aria-hidden": "true" } }).createSpan({ cls: c("reader-ornament-mark") });
        this.nextCard = card;
        const next = card.createEl("button", {
            cls: c("reader-next-button"),
            attr: { type: "button" },
        });
        this.onStageScroll();
        if (detour) {
            next.setText(t("reader_back_to", this.backName()));
            component.registerDomEvent(next, "click", () => this.backFromDetour());
            return;
        }
        const last = this.index === total - 1;
        if (last) {
            next.setText(t("reader_finish"));
            component.registerDomEvent(next, "click", () => this.finish());
            return;
        }
        // "Next · its name · how long it is": the end of a chapter tells you what the next one asks.
        const upcoming = this.path.chapters[this.index + 1].path;
        next.createSpan({ cls: c("reader-next-label"), text: t("reader_next_named", noteName(upcoming)) });
        component.registerDomEvent(next, "click", () => this.go(1));
        void this.nextMinutes(upcoming).then((minutes) => {
            if (generation !== this.generation || minutes === 0) return;
            next.createSpan({ cls: c("reader-next-sep"), text: "·", attr: { "aria-hidden": "true" } });
            next.createSpan({ cls: c("reader-next-minutes"), text: tCount(minutes, "reader_minutes", String(minutes)) });
        });
    }

    /** How long a chapter takes to read, from its words; 0 when it cannot be read. */
    private async nextMinutes(notePath: string): Promise<number> {
        const file = this.app.vault.getAbstractFileByPath(notePath);
        if (!(file instanceof TFile)) return 0;
        try {
            return minutesFor(wordCount(stripFrontmatter(await this.app.vault.cachedRead(file))));
        } catch (error) {
            log.debug(`[Reader] could not measure ${notePath}: ${String(error)}`);
            return 0;
        }
    }

    /**
     * The page turns the way you went (#667): forward slides in from the right, back from the left,
     * a reading that just opened rises. The same element is reused, so the class is taken off and
     * the box read once — that restarts the animation instead of leaving it finished.
     */
    private turnPage(page: HTMLElement): void {
        const turns = [c("reader-page--forward"), c("reader-page--back"), c("reader-page--enter")];
        page.removeClass(...turns);
        void page.offsetWidth;
        page.addClass(this.turn > 0 ? turns[0] : this.turn < 0 ? turns[1] : turns[2]);
        this.turn = 0;
    }

    /** The hairline, the minutes left and the next card, from where the page is scrolled to. */
    private onStageScroll(): void {
        const els = this.els;
        if (!els) return;
        const { stage } = els;
        const fraction = this.ended ? 1 : readFraction(stage.scrollTop, stage.scrollHeight, stage.clientHeight);
        els.hairline.setCssProps?.({ "--zf-reader-read": String(Math.round(fraction * 1000) / 1000) });
        if (fraction >= END_OF_CHAPTER) this.reachedEnd = true;
        this.keepScroll(fraction);
        const wpm = paceWpm(this.pace);
        const left = this.ended ? 0 : minutesLeft(this.chapterWords, fraction, wpm);
        const book = this.ended ? 0 : this.bookMinutes(fraction, wpm);
        // Quiet (#722): it lives in the bar, which shows only while you move or press a key.
        const text = !this.prefs.timeLeft || left === 0 ? "" : book > left ? `${tCount(left, "reader_minutes_left", String(left))} · ${t("reader_book_left", this.duration(book))}` : tCount(left, "reader_minutes_left", String(left));
        els.minutes.setText(text);
        els.minutes.toggleClass(c("reader-hidden"), text === "");
        const atEnd = !scrolls(stage.scrollHeight, stage.clientHeight) || fraction >= END_OF_CHAPTER;
        this.nextCard?.toggleClass(c("reader-next--arrived"), atEnd);
    }

    /**
     * One sample of your pace (#722), taken as you leave a chapter you read to its end: its words over
     * the time it was open. A chapter skimmed or left open is not reading, and `learnPace` drops it.
     * Kept on this device only.
     */
    private samplePace(): void {
        const opened = this.chapterOpenedAt;
        this.chapterOpenedAt = Date.now();
        const reached = this.reachedEnd;
        this.reachedEnd = false;
        if (!reached || this.chapterWords <= 0) return;
        const next = learnPace(this.pace, { words: this.chapterWords, ms: Date.now() - opened });
        if (next === this.pace) return;
        this.pace = next;
        this.app?.saveLocalStorage?.(PACE_STORAGE_KEY, next);
    }

    /** How far into the chapter you are, kept a moment after you stop scrolling (a book or a paper). */
    private keepScroll(fraction: number): void {
        const path = this.sourcePath;
        if (!path || !this.source || this.ended) return;
        const chapter = this.index;
        const win = this.root?.win ?? window;
        win.clearTimeout(this.scrollSaveTimer);
        this.scrollSaveTimer = win.setTimeout(() => {
            if (this.sourcePath === path && this.index === chapter) rememberSourceScroll(this.app, this.plugin, path, chapter, this.source?.chapters.length ?? chapter + 1, fraction);
        }, SCROLL_SAVE_MS);
    }

    /** Minutes left in the book: this chapter's remainder and the chapters after it (#722). */
    private bookMinutes(fraction: number, wpm: number): number {
        const total = this.source?.chapters.length ?? this.path?.chapters.length ?? 0;
        const after = Math.max(0, total - this.index - 1);
        const chapterWordsLeft = Math.round(this.chapterWords * (1 - fraction));
        // Read through by a search: the words of each chapter to come. Otherwise, the average so far.
        const texts = this.searchTexts;
        if (texts && texts.length === total) {
            return bookMinutesLeft({ chapterWordsLeft, upcoming: texts.slice(this.index + 1).map(wordCount), wpm });
        }
        const seen = [...this.seenWords.values()].filter((words) => words > 0);
        const averageWords = seen.length > 0 ? seen.reduce((sum, words) => sum + words, 0) / seen.length : this.chapterWords;
        return bookMinutesLeft({ chapterWordsLeft, upcoming: { chapters: after, averageWords }, wpm });
    }

    /** A time as the bar says it: "40 min", "3 h", "3 h 40 min". */
    private duration(total: number): string {
        const { hours, minutes } = splitMinutes(total);
        if (hours === 0) return t("reader_time_min", String(minutes));
        return minutes === 0 ? t("reader_time_h", String(hours)) : t("reader_time_h_min", String(hours), String(minutes));
    }

    /**
     * Focus mode (#667): the block nearest the reading line — a band a little above the middle —
     * is marked, and the stylesheet dims the rest when focus is on. Watched always, so turning focus
     * on mid-chapter lights the right paragraph at once.
     */
    private watchFocus(body: HTMLElement, component: Component): void {
        const stage = this.els?.stage;
        // Obsidian's renderer draws a section per block; the jest fake draws one wrapper of paragraphs.
        const blocks = Array.from(body.children) as HTMLElement[];
        if (!stage || blocks.length === 0) return;
        const mark = c("reader-focus-current");
        let current: HTMLElement = blocks[0];
        current.addClass(mark);
        // The reader's own window's observer: a pop-out window has its own.
        const win = this.viewWindow() as unknown as { IntersectionObserver?: typeof IntersectionObserver } | undefined;
        const Observer = win?.IntersectionObserver;
        if (!Observer) return;
        const observer = new Observer(
            (entries: IntersectionObserverEntry[]) => {
                const hit = entries.find((entry) => entry.isIntersecting)?.target as HTMLElement | undefined;
                if (!hit || hit === current) return;
                current.removeClass(mark);
                current = hit;
                hit.addClass(mark);
            },
            { root: stage, rootMargin: "-38% 0px -56% 0px", threshold: 0 }
        );
        for (const block of blocks) observer.observe(block);
        component.register(() => observer.disconnect());
    }

    /** The note on screen: the deepest detour, or the chapter. */
    private reading(): string | null {
        if (!this.path) return null;
        return this.detours[this.detours.length - 1] ?? this.path.chapters[this.index].path;
    }

    /** Where one step back lands: the previous detour, or the chapter you left from. */
    private backName(): string {
        const previous = this.detours.length > 1 ? this.detours[this.detours.length - 2] : this.path?.chapters[this.index].path;
        return previous ? noteName(previous) : "";
    }

    private renderPill(): void {
        if (!this.pill) return;
        if (this.detours.length > 0) {
            this.pill.toggleClass(c("reader-hidden"), false);
            this.pill.toggleClass(c("reader-jump-pill"), false);
            this.pill.setText(`↩ ${t("reader_back_to", this.backName())}`);
            return;
        }
        // A jump inside a book (#718): where you were, until it fades by itself.
        const back = this.jumpPillShown ? this.jumps.peek() : undefined;
        this.pill.toggleClass(c("reader-hidden"), !back);
        this.pill.toggleClass(c("reader-jump-pill"), Boolean(back));
        this.pill.setText(back ? `← ${t("reader_back_to", back.label)}` : "");
    }

    /**
     * A jump inside a book (#718): a link, Contents, *Go to note*. Where you were is kept first, so
     * the pill — or Alt+← — brings you back to the very line.
     */
    private jumpTo(chapter: number, fragment?: string): void {
        const stage = this.els?.stage;
        if (!this.path || !stage) return;
        this.jumps.push({ chapter: this.index, top: stage.scrollTop, label: this.sourceLabel(this.index) });
        this.closeNote();
        if (chapter !== this.index) this.show(chapter);
        if (fragment) this.scrollToFragment(fragment);
        this.flashJumpPill();
    }

    /** Back to where the last jump left from. False when there is nowhere to go back to. */
    private backFromJump(): boolean {
        const back = this.jumps.pop();
        const stage = this.els?.stage;
        if (!back || !stage) return false;
        this.closeNote();
        if (back.chapter !== this.index) {
            this.pendingTop = back.top;
            this.show(back.chapter);
        } else {
            stage.scrollTop = back.top;
        }
        this.jumpPillShown = this.jumps.size > 0;
        this.renderPill();
        return true;
    }

    /** The way back, for a while: it goes away by itself, and an ordinary turn puts it away. */
    private flashJumpPill(): void {
        const win = this.root?.win ?? window;
        win.clearTimeout(this.jumpPillTimer);
        this.jumpPillShown = true;
        this.renderPill();
        this.jumpPillTimer = win.setTimeout(() => {
            this.jumpPillShown = false;
            this.renderPill();
        }, JUMP_PILL_MS);
    }

    /** The note a link in the chapter points at, resolved the way Obsidian resolves it. */
    private linkTarget(event: Event): { link: HTMLElement; href: string; file: TFile | null } | null {
        const link = (event.target as HTMLElement | null)?.closest?.("a.internal-link") as HTMLElement | null;
        if (!link || !this.path) return null;
        const href = link.getAttribute("data-href") ?? link.getAttribute("href");
        if (!href) return null;
        const file = this.app.metadataCache.getFirstLinkpathDest(href.split("#")[0], this.reading() ?? "");
        return { link, href, file };
    }

    /**
     * A link inside a chapter is a **peek** (#670): read it in place, take it as a detour, jump to it
     * when it is a chapter, or add it to this reading. Mod-click still opens it in a tab. A link to a
     * note that does not exist yet only says so — following it would create the note, and the Reader
     * writes nothing.
     */
    private onLink(event: MouseEvent): void {
        const target = event.target as HTMLElement | null;
        // A highlight drawn inside a link answers its own click (its popover), not the link's.
        if (target?.closest?.(`mark.${c("reader-highlight")}`)) return;
        // A tag is not a note to peek at, and following its href would only rewrite the hash.
        if (target?.closest?.("a.tag")) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        const found = this.linkTarget(event);
        if (!found) return;
        event.preventDefault();
        event.stopPropagation();
        // A middle click, like a mod-click, is "in a new tab".
        if (event.type === "auxclick" || Keymap.isModEvent(event)) {
            if ((event.type !== "auxclick" || event.button === 1) && found.file) {
                void this.app.workspace.openLinkText(found.file.path, this.reading() ?? "", "tab");
            }
            return;
        }
        const block = found.link.closest<HTMLElement>("p, blockquote, ul, ol, table, h1, h2, h3, h4, h5, h6, .callout") ?? found.link;
        this.openPeek(block, found.file?.path ?? null, found.href);
    }

    /**
     * Draw a peek right under `anchor`'s block — in the chapter, or under a row of the context
     * panel. Inline, not floating: it scrolls with what it explains and needs no coordinates.
     */
    private openPeek(anchor: HTMLElement, notePath: string | null, label: string): void {
        if (!this.path) return;
        this.closePeek();
        const parent = anchor.parentElement;
        if (!parent) return;
        const generation = ++this.peekGeneration;
        const scope = new Component();
        scope.load();
        this.peekScope = scope;
        const card = parent.createDiv({
            cls: c("reader-peek"),
            attr: { role: "dialog", "aria-label": t("reader_peek_label", noteName(notePath ?? label)) },
        });
        anchor.after(card);
        this.peek = card;

        const at = notePath ? placeInPath(this.path.chapters, notePath) : -1;
        card.createDiv({
            cls: c("reader-peek-place"),
            text: !notePath ? t("reader_peek_missing") : at >= 0 ? t("reader_peek_in_path", String(at + 1)) : t("reader_peek_outside"),
        });
        const title = card.createDiv({ cls: c("reader-peek-title"), text: noteName(notePath ?? label) });
        if (notePath) hoverPreview(this.app, title, notePath, scope);
        const excerpt = card.createDiv({ cls: c("reader-peek-excerpt") });
        const actions = card.createDiv({ cls: c("reader-peek-actions") });
        const action = (key: LocaleKey, primary: boolean, run: () => void) => {
            const button = actions.createEl("button", {
                cls: [c("reader-peek-action"), ...(primary ? ["mod-cta"] : [])].join(" "),
                attr: { type: "button" },
                text: t(key),
            });
            scope.registerDomEvent(button, "click", run);
        };

        if (notePath) {
            if (notePath !== this.reading()) action("reader_peek_detour", true, () => this.takeDetour(notePath));
            if (at >= 0) action("reader_peek_jump", false, () => this.show(at));
            else action("reader_peek_add", false, () => this.addToReading(notePath));
            action("reader_peek_tab", false, () => {
                this.closePeek();
                void this.app.workspace.openLinkText(notePath, this.reading() ?? "", "tab");
            });
            const file = this.app.vault.getAbstractFileByPath(notePath);
            if (file instanceof TFile) {
                void this.app.vault
                    .cachedRead(file)
                    .then((markdown) => {
                        if (generation === this.peekGeneration && this.peek === card) excerpt.setText(plainExcerpt(markdown));
                    })
                    .catch((error: unknown) => log.debug(`[Reader] peek excerpt failed: ${String(error)}`));
            }
        }
        action("reader_peek_close", false, () => this.closePeek());
    }

    private closePeek(): void {
        this.peekGeneration++;
        this.peek?.remove();
        this.peek = null;
        this.peekScope?.unload();
        this.peekScope = null;
    }

    private takeDetour(notePath: string): void {
        const reading = this.reading();
        if (!reading) return;
        this.detours = pushDetour(this.detours, notePath, reading);
        this.detourCount++;
        this.closePeek();
        this.render();
    }

    private backFromDetour(): void {
        if (this.detours.length === 0) return;
        this.detours = popDetour(this.detours);
        this.render();
    }

    /** Add a note after this chapter, for this reading only (#670): the reading is not a file. */
    private addToReading(notePath: string): void {
        if (!this.path) return;
        this.path = addToReading(this.path, this.index, notePath);
        this.closePeek();
        this.render();
    }

    private show(index: number): void {
        if (!this.path) return;
        // The cover's entrance is over: the next chapter turns as chapters do.
        this.root?.removeClass(c("reader--from-cover"));
        this.samplePace();
        this.pending = null;
        this.detours = [];
        const target = Math.max(0, Math.min(index, this.path.chapters.length - 1));
        this.turn = this.ended || target < this.index ? -1 : target > this.index ? 1 : 0;
        this.ended = false;
        this.index = target;
        this.render();
        this.app.workspace.requestSaveLayout();
        this.rememberPlace();
    }

    private go(delta: number): void {
        if (!this.path) return;
        // An ordinary turn: the way back from a jump is no longer where you are reading (#718).
        this.jumps.clear();
        this.jumpPillShown = false;
        if (this.ended) {
            // Back from the end card lands on the last chapter; forward stays on the end.
            if (delta < 0) this.show(this.index);
            return;
        }
        const next = this.index + delta;
        if (next >= this.path.chapters.length) {
            this.finish();
            return;
        }
        if (next < 0) return;
        this.show(next);
    }

    /** The next chapter — the palette's *Reader: next chapter*, and →. */
    nextChapter(): void {
        this.go(1);
    }

    /** The previous chapter — the palette's *Reader: previous chapter*, and ←. */
    previousChapter(): void {
        this.go(-1);
    }

    /**
     * Leave the reader (#667) — Esc, ×, or the palette's *Reader: exit*: the page fades, then the
     * sidebars come back as they were, the leaf you were in is active again, and this one closes.
     * With reduced motion (or no window to ask) it goes at once.
     */
    exit(): void {
        if (this.leaving) return;
        this.leaving = true;
        const root = this.root;
        if (!root || !this.motionAllowed()) {
            exitReader(this.app, this.leaf);
            return;
        }
        root.addClass(c("reader--leaving"));
        window.setTimeout(() => exitReader(this.app, this.leaf), EXIT_MS);
    }

    // ── the end of a path (#672) ─────────────────────────────────────────────

    /** Past the last chapter: the end card, and the reading forgotten by resume — it is finished. */
    private finish(): void {
        if (!this.path) return;
        this.detours = [];
        this.closePeek();
        this.ended = true;
        this.rememberPlace();
        this.render();
    }

    /** The chapters of this reading, in the order they were read. */
    private chapterPaths(): string[] {
        return this.path?.chapters.map((chapter) => chapter.path) ?? [];
    }

    private renderEnd(): void {
        if (!this.els || !this.path) return;
        if (this.sourcePath) return this.renderSourceEndCard();
        this.highlights?.hidePopover();
        this.chapter?.unload();
        const component = new Component();
        component.load();
        this.chapter = component;
        const path = this.path;
        const counts = this.highlights?.sessionCounts() ?? { highlights: 0, notes: 0 };
        const thesis = path.chapters.find((chapter) => chapter.role === "thesis")?.path ?? path.seed;
        const kindLabel = t(KIND_KEY[this.kind]);
        const title = this.name ?? noteName(path.seed);
        // What a save proposes and an export is called: the note and the way it was read.
        const docName = this.name ?? `${noteName(path.seed)} · ${kindLabel}`;
        renderEndCard(
            this.els.page,
            {
                title,
                kindLabel,
                thesis,
                defaultName: docName,
                savedAs: this.savedId ? this.name : undefined,
                stats: {
                    minutes: Math.max(1, Math.round((Date.now() - this.startedAt) / 60000)),
                    notes: Math.max(1, this.visited.size),
                    detours: this.detourCount,
                    highlights: counts.highlights,
                    marginNotes: counts.notes,
                },
                status: this.endStatus,
                actions: {
                    save: (name) => this.saveReading(name),
                    exportDocument: () => this.exportReading(docName, kindLabel),
                    cultivate: () => this.cultivateThesis(thesis),
                    again: () => this.show(0),
                    ...(this.kind === "selection" ? {} : { another: () => readFrom(this.app, path.seed) }),
                },
            },
            component
        );
        this.els.stage.scrollTop = 0;
    }

    /** Keep the path in plugin data — its chapters, in this order — never in a note. */
    private async saveReading(name: string): Promise<void> {
        const settings = this.plugin?.settings;
        if (!settings || !this.path) return;
        const paths = this.chapterPaths();
        const id = this.savedId ?? savedId(paths, Date.now());
        settings.readerSaved = saveReading(normalizeSaved(settings.readerSaved), {
            id,
            name,
            kind: this.kind,
            seed: this.path.seed,
            paths,
            at: Date.now(),
        });
        await this.plugin?.saveSettings?.();
        this.savedId = id;
        this.name = name;
        this.render();
        // Home lists saved readings: an open Home shows the new one now, not on its next redraw.
        for (const leaf of this.app.workspace.getLeavesOfType?.("zettelflow-home") ?? []) {
            (leaf.view as { refresh?: () => void } | null)?.refresh?.();
        }
    }

    /** The preview, then — only on Export — one new note; Undo sends it to the trash. */
    private exportReading(title: string, kindLabel: string): void {
        if (!this.path) return;
        const seed = this.path.seed;
        const folder = seed.includes("/") ? seed.slice(0, seed.lastIndexOf("/")) : "";
        const date = new Date().toLocaleDateString();
        new ReadingExportModal(
            this.app,
            { title, intro: t("reader_export_doc_intro", kindLabel, date), chapters: this.chapterPaths(), folder, fileName: title },
            (result) => this.onExported(result)
        ).open();
    }

    private onExported(result: ExportResult): void {
        if (!result.ok || !result.path) {
            this.endStatus = { text: t("reader_export_failed") };
        } else {
            const written = result.path;
            const batch = result.batch;
            this.endStatus = {
                text: t("reader_export_done", written),
                open: () => void this.app.workspace.openLinkText(written, "", "tab"),
                ...(batch
                    ? {
                          undo: () =>
                              void undoBatch(batch).then((outcome) => {
                                  this.endStatus = {
                                      text: t(outcome.hadWork && outcome.failed.length === 0 ? "reader_export_removed" : "reader_export_undo_failed"),
                                  };
                                  if (this.ended) this.render();
                              }),
                      }
                    : {}),
            };
        }
        if (this.ended) this.render();
    }

    /** Hand the thesis to Cultivate, giving the workspace back first. */
    private cultivateThesis(thesis: string): void {
        exitReader(this.app, this.leaf);
        void activateSurface(this.app, "zettelflow-home", "cultivate", { target: thesis });
    }

    /** Keep where this reading is, so the chooser can offer to resume it (#669). */
    private rememberPlace(): void {
        const settings = this.plugin?.settings;
        if (!settings || !this.path) return;
        if (this.sourcePath) {
            if (this.source) rememberSourcePlace(this.app, this.plugin, this.sourcePath, this.ended ? this.path.chapters.length - 1 : this.index, this.path.chapters.length);
            return;
        }
        const key = readingKey(this.kind, this.path.seed, this.paths);
        settings.readerResume = recordResume(
            normalizeResume(settings.readerResume),
            key,
            this.index,
            this.path.chapters.length,
            Date.now()
        );
        void this.plugin?.saveSettings?.();
    }

    // ── a source: a PDF or an EPUB (#681, #682) ──────────────────────────────

    /** How a reader cites the chapter on screen: `p. 42`, or the chapter's name. */
    private sourceLabel(index: number): string {
        return this.source?.chapters[index]?.label ?? String(index + 1);
    }

    private async renderSourceChapter(): Promise<void> {
        if (!this.els || !this.path || !this.sourcePath) return;
        const generation = ++this.generation;
        const { page, stage } = this.els;
        const path = this.sourcePath;
        const doc = this.source;
        const index = this.index;
        this.visited.add(`${path}#${index}`);
        this.closePeek();
        this.highlights?.reset();
        this.chapter?.unload();
        const component = new Component();
        component.load();
        this.chapter = component;

        page.empty();
        this.turnPage(page);
        this.chapterWords = 0;
        this.nextCard = null;
        const total = this.path.chapters.length;
        const chapter = doc?.chapters[index];
        page.createDiv({
            cls: c("reader-count"),
            text: doc ? t(doc.format === "pdf" ? "reader_source_count_page" : "reader_source_count_chapter", String(index + 1), String(total)) : "",
        });
        if (chapter?.section) {
            page.createDiv({ cls: c("reader-role") }).createSpan({ cls: [c("reader-role-tag"), c("reader-role-tag--source")], text: chapter.section });
        }
        if (doc?.imageOnly) {
            // Said where you are, before you try (owner, 2026-10-06): a scan cannot be highlighted.
            const banner = page.createDiv({ cls: c("reader-source-banner"), attr: { role: "note" } });
            setIcon(banner.createSpan({ cls: c("reader-source-banner-icon") }), "scan-line");
            banner.createSpan({ cls: c("reader-source-banner-text"), text: t("reader_source_scanned") });
            const note = banner.createEl("button", { cls: c("reader-source-banner-action"), attr: { type: "button" }, text: t("reader_source_note_page") });
            component.registerDomEvent(note, "click", () => this.highlights?.notePage(note));
        } else if (this.sourceLayout === "page" && doc?.hasPageView) {
            const hint = page.createDiv({ cls: c("reader-source-hint") });
            hint.createSpan({ text: t("reader_source_page_hint") });
            const back = hint.createEl("button", { cls: c("reader-source-hint-action"), attr: { type: "button" }, text: t("reader_source_reading_view") });
            component.registerDomEvent(back, "click", () => this.toggleLayout());
        }
        const body = page.createDiv({
            cls: ["markdown-rendered", c("reader-body"), c("reader-source-body"), c(`reader-source-body--${doc?.format ?? "pdf"}`)].join(" "),
        });
        stage.scrollTop = 0;
        this.onStageScroll();
        // Links inside a book stay in the book, and only there (L1): one that leaves it is never followed.
        component.registerDomEvent(body, "click", (event) => this.onSourceLink(event), { capture: true });

        if (!doc) {
            body.createDiv({ cls: c("reader-missing"), text: t(this.sourceFailed ? "reader_source_failed" : "reader_source_opening") });
            return;
        }
        let picture = false;
        try {
            const drawn = await doc.draw(index, body, component, this.sourceLayout);
            picture = drawn.picture;
            this.chapterWords = drawn.words;
            this.seenWords.set(index, drawn.words);
        } catch (error) {
            log.error(`[Reader] could not draw ${path} at ${index}: ${error instanceof Error ? error.message : String(error)}`);
            if (generation === this.generation) body.createDiv({ cls: c("reader-missing"), text: t("reader_source_failed") });
        }
        if (generation !== this.generation) return;
        body.toggleClass(c("reader-source-body--picture"), picture);
        // A Reader already open when the cover was clicked: the flight plays once the page is drawn.
        if (this.root && this.els) playCoverFlight(this.root, this.els.stage);
        // Back from a jump lands on the very line it left (#718).
        if (this.pendingTop !== null) {
            stage.scrollTop = this.pendingTop;
            this.pendingTop = null;
        } else if (this.pendingShare !== null && index === this.index) {
            const share = this.pendingShare;
            this.pendingShare = null;
            stage.scrollTop = resumeScroll(share, stage.scrollHeight, stage.clientHeight);
            // Pictures arrive after the text and move the page: land again once they have.
            stage.win.setTimeout(() => {
                if (generation === this.generation) stage.scrollTop = resumeScroll(share, stage.scrollHeight, stage.clientHeight);
            }, RESUME_SETTLE_MS);
        }
        // An open search tints its matches in every chapter it lands on (#719).
        if (this.searchEl) this.markSearch();
        this.onStageScroll();
        this.watchFocus(body, component);
        // The highlights of this page or chapter, found again by their words (#681).
        void this.highlights?.attach(body, path, component, this.els?.margin ?? null, { at: index, label: this.sourceLabel(index) }).then(() => {
            if (generation !== this.generation || !this.pendingHighlight) return;
            if (this.highlights?.reveal(this.pendingHighlight)) this.pendingHighlight = null;
        });

        const card = page.createDiv({ cls: c("reader-next") });
        // The chapter's end, quietly (#724): an ornament that fades in as you arrive. No number.
        card.createDiv({ cls: c("reader-ornament"), attr: { "aria-hidden": "true" } }).createSpan({ cls: c("reader-ornament-mark") });
        this.nextCard = card;
        const next = card.createEl("button", { cls: c("reader-next-button"), attr: { type: "button" } });
        this.onStageScroll();
        if (index === total - 1) {
            next.setText(t("reader_finish"));
            component.registerDomEvent(next, "click", () => this.finish());
            return;
        }
        next.createSpan({ cls: c("reader-next-label"), text: t("reader_next_named", this.sourceLabel(index + 1)) });
        component.registerDomEvent(next, "click", () => this.go(1));
    }

    /** A link inside a source: to another place in the book, or nowhere (#682, L1). */
    private onSourceLink(event: MouseEvent): void {
        const target = event.target as HTMLElement | null;
        if (target?.closest?.(`mark.${c("reader-highlight")}`)) return;
        const link = target?.closest?.("a") as HTMLElement | null;
        if (!link) return;
        event.preventDefault();
        event.stopPropagation();
        const href = link.getAttribute("data-zf-href");
        const resolved = href ? this.source?.resolveLink?.(this.index, href) : null;
        if (!resolved) return;
        // A footnote is read where it is referenced (#718); anything else is a jump with a way back.
        const note = isNoteLink({
            text: link.textContent ?? "",
            noteref: link.getAttribute("data-zf-noteref") === "true",
            inSup: Boolean(link.closest?.("sup")),
        });
        if (note && resolved.fragment) {
            void this.openNote(link, resolved.chapter, resolved.fragment);
            return;
        }
        this.jumpTo(resolved.chapter, resolved.fragment);
    }

    /** The note a footnote mark points at, in this chapter or another one (endnotes). */
    private async findNote(chapter: number, fragment: string): Promise<string | null> {
        const id = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(fragment) : fragment.replace(/["\\]/g, "");
        const selector = `[data-zf-id="${id}"]`;
        if (chapter === this.index) {
            const el = this.els?.page.querySelector<HTMLElement>(selector) ?? null;
            return el ? noteExcerpt(el) : null;
        }
        const doc = this.source;
        if (!doc) return null;
        // Drawn aside, never shown: the other chapter is read for its note and let go at once.
        const scratch = this.root?.createDiv();
        if (!scratch) return null;
        scratch.remove();
        const scope = new Component();
        scope.load();
        try {
            await doc.draw(chapter, scratch, scope, "reading");
            const el = scratch.querySelector<HTMLElement>(selector);
            return el ? noteExcerpt(el) : null;
        } catch (error) {
            log.debug(`[Reader] the note in chapter ${chapter} cannot be read: ${String(error)}`);
            return null;
        } finally {
            scope.unload();
        }
    }

    /** A footnote, floating over the page at its mark (#718). The page does not move. */
    private async openNote(link: HTMLElement, chapter: number, fragment: string): Promise<void> {
        const generation = this.generation;
        const text = await this.findNote(chapter, fragment);
        if (generation !== this.generation || !this.root) return;
        if (!text) {
            this.jumpTo(chapter, fragment);
            return;
        }
        this.closeNote();
        const root = this.root;
        const pop = root.createDiv({ cls: c("reader-note-pop"), attr: { role: "dialog", "aria-label": t("reader_note_label") } });
        pop.createDiv({ cls: c("reader-note-pop-text"), text });
        const go = pop.createEl("button", { cls: c("reader-note-pop-go"), text: t("reader_note_go"), attr: { type: "button" } });
        const box = root.getBoundingClientRect();
        const at = link.getBoundingClientRect();
        // Positioned by two custom properties the stylesheet reads — no inline layout.
        pop.setCssProps?.({
            "--zf-note-x": `${Math.round(at.left + at.width / 2 - box.left)}px`,
            "--zf-note-y": `${Math.round(at.bottom - box.top)}px`,
        });
        const scope = new Component();
        scope.load();
        scope.registerDomEvent(go, "click", () => this.jumpTo(chapter, fragment));
        this.notePop = pop;
        this.notePopScope = scope;
    }

    // ── search inside the book (#719) ───────────────────────────────────────

    /** Ctrl/Cmd+F or the bar's search: a slim bar under the top, focused. Books and papers only. */
    private openSearch(): boolean {
        if (!this.sourcePath || !this.root) return false;
        if (this.searchEl) {
            this.searchInput?.focus();
            this.searchInput?.select();
            return true;
        }
        const scope = new Component();
        scope.load();
        this.searchScope = scope;
        const bar = this.root.createDiv({ cls: c("reader-search"), attr: { role: "search" } });
        const row = bar.createDiv({ cls: c("reader-search-row") });
        setIcon(row.createSpan({ cls: c("reader-search-icon") }), "search");
        const input = row.createEl("input", {
            cls: c("reader-search-input"),
            attr: { type: "search", placeholder: t("reader_search_placeholder"), "aria-label": t("reader_search") },
        });
        const count = row.createSpan({ cls: c("reader-search-count"), attr: { "aria-live": "polite" } });
        const button = (icon: string, key: LocaleKey, run: () => void) => {
            const el = row.createEl("button", { cls: ["clickable-icon", c("reader-search-button")].join(" "), attr: { type: "button", "aria-label": t(key) } });
            setIcon(el, icon);
            scope.registerDomEvent(el, "click", run);
        };
        button("chevron-up", "reader_search_previous", () => this.stepSearch(-1));
        button("chevron-down", "reader_search_next", () => this.stepSearch(1));
        button("x", "reader_search_close", () => this.closeSearch());
        const list = bar.createDiv({ cls: c("reader-search-results") });
        scope.registerDomEvent(input, "input", () => {
            list.removeClass(c("reader-search-results--folded"));
            const win = this.root?.win ?? window;
            win.clearTimeout(this.searchTimer);
            this.searchTimer = win.setTimeout(() => void this.runSearch(), SEARCH_DEBOUNCE_MS);
        });
        scope.registerDomEvent(input, "keydown", (event: KeyboardEvent) => {
            if (event.isComposing) return;
            if (event.key === "Enter") {
                event.preventDefault();
                this.stepSearch(event.shiftKey ? -1 : 1);
            } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                this.stepSearch(event.key === "ArrowUp" ? -1 : 1);
            } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                this.closeSearch();
            }
        });
        this.searchEl = bar;
        this.searchInput = input;
        this.searchCount = count;
        this.searchList = list;
        input.focus?.();
        void this.ensureSearchIndex();
        return true;
    }

    /** The book's text, read once per reading, chapter by chapter, yielding so the page never freezes. */
    private ensureSearchIndex(): Promise<string[] | null> {
        if (this.searchTexts) return Promise.resolve(this.searchTexts);
        if (this.searchBuilding) return this.searchBuilding;
        const doc = this.source;
        const root = this.root;
        if (!doc || !root || doc.imageOnly) return Promise.resolve(null);
        const generation = this.sourceGeneration;
        this.searchCount?.setText(t("reader_search_reading"));
        this.searchBuilding = (async () => {
            const texts: string[] = [];
            const win = root.win ?? window;
            for (let i = 0; i < doc.chapters.length; i++) {
                // Drawn aside, as the page draws it, so a match's offsets are the page's own.
                const scratch = root.createDiv();
                scratch.remove();
                const scope = new Component();
                scope.load();
                try {
                    await doc.draw(i, scratch, scope, "reading");
                    // As a reader sees it — blocks apart; where the walker finds no text node, what it reads.
                    texts.push(readableText(scratch) || (scratch.textContent ?? ""));
                } catch (error) {
                    log.debug(`[Reader] chapter ${i} cannot be read for search: ${String(error)}`);
                    texts.push("");
                } finally {
                    scope.unload();
                }
                if (generation !== this.sourceGeneration) return null;
                if (i % 4 === 3) await new Promise<void>((resolve) => win.setTimeout(resolve, 0));
            }
            this.searchTexts = texts;
            return texts;
        })();
        return this.searchBuilding;
    }

    private async runSearch(): Promise<void> {
        const query = this.searchInput?.value ?? "";
        const texts = await this.ensureSearchIndex();
        if (!this.searchEl || query !== (this.searchInput?.value ?? "")) return;
        if (!texts) {
            this.searchCount?.setText(t(this.source?.imageOnly ? "reader_search_scan" : "reader_search_unavailable"));
            return;
        }
        this.searchResult = searchBook(texts, query);
        this.searchAt = -1;
        this.renderSearch();
        this.markSearch();
    }

    /** The count and the list of results, each with its snippet and the source's own label. */
    private renderSearch(): void {
        const list = this.searchList;
        const count = this.searchCount;
        const scope = this.searchScope;
        const result = this.searchResult;
        if (!list || !count || !scope) return;
        list.empty();
        const query = (this.searchInput?.value ?? "").trim();
        if (!result || result.matches.length === 0) {
            count.setText(query.length < 2 ? "" : t("reader_search_none"));
            return;
        }
        const total = result.matches.length;
        const found = `${tCount(total, "reader_search_results", String(total))} · ${tCount(result.chapters, "reader_search_in_chapters", String(result.chapters))}`;
        count.setText(this.searchAt >= 0 ? `${t("reader_search_current", String(this.searchAt + 1), String(total))} · ${found}` : found);
        result.matches.slice(0, SEARCH_LIST_LIMIT).forEach((match, i) => {
            const row = list.createEl("button", {
                cls: [c("reader-search-result"), ...(i === this.searchAt ? [c("reader-search-result--current")] : [])].join(" "),
                attr: { type: "button" },
            });
            row.createDiv({ cls: c("reader-search-where"), text: this.sourceLabel(match.chapter) });
            const snippet = row.createDiv({ cls: c("reader-search-snippet") });
            snippet.createSpan({ text: match.before });
            snippet.createSpan({ cls: c("reader-search-snippet-hit"), text: match.match });
            snippet.createSpan({ text: match.after });
            scope.registerDomEvent(row, "click", () => this.goToMatch(i));
        });
    }

    private goToMatch(i: number): void {
        const match = this.searchResult?.matches[i];
        if (!match) return;
        this.searchAt = i;
        this.renderSearch();
        // Out of the way while you look at the match; typing brings the list back.
        this.searchList?.addClass(c("reader-search-results--folded"));
        this.searchReveal = true;
        // A match in another chapter is a jump, with its way back (#718).
        if (match.chapter !== this.index) this.jumpTo(match.chapter);
        else this.markSearch();
    }

    /** Enter / Shift+Enter: the next match from where you are, wrapping round the book. */
    private stepSearch(direction: 1 | -1): void {
        const matches = this.searchResult?.matches ?? [];
        if (matches.length === 0) return;
        let next: number;
        if (this.searchAt < 0) {
            const ahead = matches.findIndex((match) => match.chapter >= this.index);
            next = direction > 0 ? (ahead < 0 ? 0 : ahead) : ahead <= 0 ? matches.length - 1 : ahead - 1;
        } else {
            next = (this.searchAt + direction + matches.length) % matches.length;
        }
        this.goToMatch(next);
    }

    /** Tint every match in the chapter on screen; outline the current one and bring it into view. */
    private markSearch(): void {
        this.unmarkSearch();
        const body = this.els?.page.querySelector<HTMLElement>(`.${c("reader-source-body")}`);
        const result = this.searchResult;
        if (!body || !result || result.matches.length === 0) return;
        const query = this.searchInput?.value ?? "";
        const here = result.matches.filter((match) => match.chapter === this.index);
        const current = this.searchAt >= 0 ? result.matches[this.searchAt] : null;
        // The current match by its place among this chapter's matches.
        const ordinal = current && current.chapter === this.index ? here.indexOf(current) : -1;
        // Found in the text as it reads (blocks apart), drawn on the page's own offsets.
        const readable = readableWithMap(body);
        const spans = matchesIn(readable.text, query).map((span) => ({ start: readable.toChapter(span.start), end: readable.toChapter(span.end) }));
        // Last first: wrapping a later match never moves the offsets of an earlier one.
        let currentMark: HTMLElement | null = null;
        for (let k = spans.length - 1; k >= 0; k--) {
            const isCurrent = k === ordinal;
            const marks = wrapSpan(body, spans[k], () => {
                const mark = body.createSpan({ cls: [c("reader-search-hit"), ...(isCurrent ? [c("reader-search-hit--current")] : [])].join(" ") });
                mark.remove();
                return mark;
            }) as unknown as HTMLElement[];
            this.searchMarks.push(...marks);
            if (isCurrent && marks[0]) currentMark = marks[0];
        }
        if (currentMark && this.searchReveal) this.scrollToEl(currentMark);
        this.searchReveal = false;
    }

    private unmarkSearch(): void {
        for (const mark of this.searchMarks) unwrapMark(mark);
        this.searchMarks = [];
    }

    private closeSearch(): void {
        (this.root?.win ?? window).clearTimeout(this.searchTimer);
        this.unmarkSearch();
        this.searchEl?.remove();
        this.searchEl = null;
        this.searchInput = null;
        this.searchCount = null;
        this.searchList = null;
        this.searchScope?.unload();
        this.searchScope = null;
        this.searchResult = null;
        this.searchAt = -1;
    }

    private closeNote(): void {
        this.notePop?.remove();
        this.notePop = null;
        this.notePopScope?.unload();
        this.notePopScope = null;
    }

    /** Bring an element a link named into view, once its chapter is drawn. */
    private scrollToFragment(fragment: string, tries = 20): void {
        let el: HTMLElement | null = null;
        try {
            const id = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(fragment) : fragment.replace(/["\\]/g, "");
            el = this.els?.page.querySelector(`[data-zf-id="${id}"]`) as HTMLElement | null;
        } catch (error) {
            log.debug(`[Reader] cannot look for #${fragment}: ${String(error)}`);
            return;
        }
        if (el) {
            this.scrollToEl(el);
            return;
        }
        if (tries > 0) window.setTimeout(() => this.scrollToFragment(fragment, tries - 1), 50);
    }

    /** The source's own contents — a paper's outline, a book's nav — or its pages, when it has none. */
    private renderSourceContents(host: HTMLElement): void {
        const doc = this.source;
        if (!doc) return;
        // Everything you marked in this book, in one place (#721).
        const sourcePath = this.sourcePath;
        if (sourcePath) {
            const notebook = host.createEl("button", { cls: c("reader-notebook-link"), attr: { type: "button" } });
            setIcon(notebook.createSpan({ cls: c("reader-notebook-icon") }), "notebook-pen");
            notebook.createSpan({ text: t("notebook_title") });
            this.panelScope?.registerDomEvent(notebook, "click", () => void openLibrary(this.app, undefined, sourcePath));
        }
        const entries = doc.toc.length > 0 ? doc.toc : doc.chapters.map((chapter, i) => ({ title: chapter.label, chapter: i, depth: 0 }));
        // The entry you are in: the last one that starts at or before the chapter on screen.
        let current = -1;
        entries.forEach((entry, i) => {
            if (entry.chapter <= this.index) current = i;
        });
        entries.forEach((entry, i) => {
            const row = host.createEl("button", {
                cls: [c("reader-toc-row"), c(`reader-toc-row--depth-${Math.min(entry.depth, 3)}`), ...(i === current ? [c("reader-toc-row--current")] : [])].join(" "),
                attr: { type: "button" },
            });
            row.createSpan({ cls: c("reader-toc-name"), text: entry.title });
            if (doc.toc.length > 0) row.createSpan({ cls: c("reader-toc-role"), text: this.sourceLabel(entry.chapter) });
            if (i === current) row.setAttribute("aria-current", "step");
            // A Contents entry is a jump: where you were stays one press away (#718).
            this.panelScope?.registerDomEvent(row, "click", () =>
                this.jumpTo(entry.chapter, "fragment" in entry && typeof entry.fragment === "string" ? entry.fragment : undefined)
            );
        });
    }

    /** The end of a source: what the reading added up to, and where to take what you marked. */
    private renderSourceEndCard(): void {
        if (!this.els || !this.sourcePath) return;
        this.highlights?.hidePopover();
        this.chapter?.unload();
        const component = new Component();
        component.load();
        this.chapter = component;
        const path = this.sourcePath;
        const counts = this.highlights?.sessionCounts() ?? { highlights: 0, notes: 0 };
        renderSourceEnd(
            this.els.page,
            {
                title: this.source?.title ?? noteName(path),
                format: this.source?.format ?? "pdf",
                stats: {
                    minutes: Math.max(1, Math.round((Date.now() - this.startedAt) / 60000)),
                    chapters: Math.max(1, this.visited.size),
                    highlights: counts.highlights,
                    marginNotes: counts.notes,
                },
                actions: {
                    library: () => {
                        exitReader(this.app, this.leaf);
                        void openLibrary(this.app, path);
                    },
                    think: () => {
                        exitReader(this.app, this.leaf);
                        void activateSurface(this.app, "zettelflow-home", "lab", { about: path });
                    },
                    again: () => this.show(0),
                },
            },
            component
        );
        this.els.stage.scrollTop = 0;
    }

    // ── panels ───────────────────────────────────────────────────────────────

    private toggle(panel: Exclude<Panel, null>): void {
        this.panel = this.panel === panel ? null : panel;
        this.renderPanel();
    }

    private renderPanel(): void {
        if (!this.els) return;
        const host = this.els.panel;
        host.empty();
        this.panelScope?.unload();
        const scope = new Component();
        scope.load();
        this.panelScope = scope;
        host.toggleClass(c("reader-panel--open"), this.panel !== null);
        if (this.panel === "contents") this.renderContents(host);
        else if (this.panel === "type") this.renderType(host);
        else if (this.panel === "context") this.renderContext(host);
    }

    private renderContents(host: HTMLElement): void {
        host.createDiv({ cls: c("reader-panel-title"), text: t("reader_contents") });
        if (this.sourcePath) {
            this.renderSourceContents(host);
            return;
        }
        this.path?.chapters.forEach((chapter, i) => {
            const row = host.createEl("button", {
                cls: [c("reader-toc-row"), ...(i === this.index ? [c("reader-toc-row--current")] : [])].join(" "),
                attr: { type: "button" },
            });
            row.createSpan({ cls: c("reader-toc-number"), text: String(i + 1).padStart(2, "0") });
            row.createSpan({ cls: c("reader-toc-name"), text: noteName(chapter.path) });
            row.createSpan({ cls: c("reader-toc-role"), text: t(ROLE_KEY[chapter.role]) });
            if (i !== this.index && this.visited.has(chapter.path)) {
                const tick = row.createSpan({ cls: c("reader-toc-tick"), attr: { "aria-label": t("reader_visited") } });
                setIcon(tick, "check");
            }
            if (i === this.index) row.setAttribute("aria-current", "step");
            this.panelScope?.registerDomEvent(row, "click", () => this.show(i));
        });
    }

    private renderType(host: HTMLElement): void {
        host.createDiv({ cls: c("reader-panel-title"), text: t("reader_type") });
        const group = <T extends string>(options: readonly T[], current: T, key: (o: T) => LocaleKey, apply: (o: T) => ReaderPrefs) => {
            const row = host.createDiv({ cls: c("reader-type-group") });
            for (const option of options) {
                const button = row.createEl("button", {
                    cls: [c("reader-type-option"), ...(option === current ? ["is-active"] : [])].join(" "),
                    attr: { type: "button", "aria-pressed": String(option === current) },
                    text: t(key(option)),
                });
                this.panelScope?.registerDomEvent(button, "click", () => this.savePrefs(apply(option)));
            }
        };
        group(READER_FONTS, this.prefs.font, (o) => FONT_KEY[o], (font) => ({ ...this.prefs, font }));
        group(READER_SIZES, this.prefs.size, (o) => SIZE_KEY[o], (size) => ({ ...this.prefs, size }));
        group(READER_THEMES, this.prefs.theme, (o) => THEME_KEY[o], (theme) => ({ ...this.prefs, theme }));
        // Focus mode: one switch, kept with the rest of the type.
        const focus = host.createDiv({ cls: c("reader-type-group") }).createEl("button", {
            cls: [c("reader-type-option"), c("reader-focus-toggle"), ...(this.prefs.focus ? ["is-active"] : [])].join(" "),
            attr: { type: "button", "aria-pressed": String(this.prefs.focus) },
        });
        setIcon(focus.createSpan({ cls: c("reader-focus-icon") }), "focus");
        focus.createSpan({ text: t("reader_focus") });
        this.panelScope?.registerDomEvent(focus, "click", () => this.savePrefs({ ...this.prefs, focus: !this.prefs.focus }));
        // The time left, quietly in the bar (#722): yours to turn off.
        const time = host.createDiv({ cls: c("reader-type-group") }).createEl("button", {
            cls: [c("reader-type-option"), c("reader-focus-toggle"), ...(this.prefs.timeLeft ? ["is-active"] : [])].join(" "),
            attr: { type: "button", "aria-pressed": String(this.prefs.timeLeft) },
        });
        setIcon(time.createSpan({ cls: c("reader-focus-icon") }), "hourglass");
        time.createSpan({ text: t("reader_time_left_toggle") });
        this.panelScope?.registerDomEvent(time, "click", () => {
            this.savePrefs({ ...this.prefs, timeLeft: !this.prefs.timeLeft });
            this.onStageScroll();
        });
    }

    private renderContext(host: HTMLElement): void {
        host.createDiv({ cls: c("reader-panel-title"), text: t("reader_context") });
        if (this.sourcePath) {
            // A source has no neighbours in the graph: what is around a page is what you marked on it.
            if (this.panelScope) this.highlights?.renderList(host, this.panelScope);
            if (host.childElementCount <= 1) host.createDiv({ cls: c("reader-context-empty"), text: t("reader_source_context_empty") });
            return;
        }
        const index = KnowledgeIndex.getInstance();
        if (!this.path || index.status !== "ready") return;
        const map = buildEvidenceMap(index.getModel(), this.reading() ?? this.path.chapters[this.index].path);
        const list = (key: LocaleKey, paths: string[]) => {
            if (paths.length === 0) return;
            host.createDiv({ cls: c("reader-context-heading"), text: t(key) });
            for (const p of paths) {
                // Each is a peek too: read it here, take it as a detour, or add it to this reading.
                const row = host.createEl("button", { cls: c("reader-context-row"), attr: { type: "button" }, text: noteName(p) });
                const scope = this.panelScope;
                scope?.registerDomEvent(row, "click", () => this.openPeek(row, p, noteName(p)));
                hoverPreview(this.app, row, p, scope ?? this);
            }
        };
        // Your highlights here too: the margin only has room on a wide pane (#671).
        if (this.panelScope) this.highlights?.renderList(host, this.panelScope);
        list("reader_supports", map.supports);
        list("reader_argues", map.contradicts);
        list("reader_questions", map.gaps.openQuestions);
        if (map.supports.length + map.contradicts.length + map.gaps.openQuestions.length === 0) {
            host.createDiv({ cls: c("reader-context-empty"), text: t("reader_context_empty") });
        }
    }

    // ── keys, idle bar, fullscreen ───────────────────────────────────────────

    /**
     * The reader's keys, on its own scope (#667). Each handler says whether it took the key: taken,
     * Obsidian stops it there (`false`); not taken — typing in a note field, nothing selected for H —
     * it goes on to the app. Esc is always taken while the reader is up, or Obsidian's own Esc would
     * hand the focus to another tab instead of closing this one.
     */
    private registerKeys(scope: Scope): void {
        const none: Modifier[] = [];
        const shift: Modifier[] = ["Shift"];
        const bind = (modifiers: Modifier[] | null, key: string, run: () => boolean) =>
            scope.register(modifiers, key, (event: KeyboardEvent) => {
                if (isTyping(event.target)) return true;
                this.wake();
                return !run();
            });
        const taken = (fn: () => void) => () => {
            fn();
            return true;
        };
        bind(none, "ArrowRight", taken(() => this.go(1)));
        bind(none, "PageDown", taken(() => this.go(1)));
        bind(none, "ArrowLeft", taken(() => this.go(-1)));
        bind(none, "PageUp", taken(() => this.go(-1)));
        bind(none, "ArrowDown", taken(() => this.scrollStage(0.12)));
        bind(none, "ArrowUp", taken(() => this.scrollStage(-0.12)));
        bind(none, " ", taken(() => this.page(1)));
        bind(shift, " ", taken(() => this.page(-1)));
        bind(none, "Home", taken(() => this.show(0)));
        bind(none, "End", taken(() => this.show((this.path?.chapters.length ?? 1) - 1)));
        bind(none, "F", taken(() => this.toggleFullscreen()));
        bind(none, "V", () => {
            if (!this.source?.hasPageView) return false;
            this.toggleLayout();
            return true;
        });
        // H keeps the selection as a highlight; Shift+H asks for a note with it (#671).
        bind(none, "H", () => this.highlights?.highlightCurrent(false) ?? false);
        bind(shift, "H", () => this.highlights?.highlightCurrent(true) ?? false);
        // 1–4 with words selected: keep them as an idea, a question, a quote, or to discuss (#720).
        for (const n of [1, 2, 3, 4]) bind(none, String(n), () => this.highlights?.chooseMeaning(n - 1) ?? false);
        // `?` is Shift+/ on one layout and its own key on another: any modifiers.
        bind(null, "?", taken(() => this.toggleShortcuts()));
        bind(none, "Escape", taken(() => this.escape()));
        // Back from a jump inside a book (#718); with nowhere to go back to, Obsidian keeps the key.
        bind(["Alt"], "ArrowLeft", () => this.backFromJump());
        // Search inside the book (#719); in a note reading the key stays Obsidian's.
        bind(["Mod"], "F", () => this.openSearch());
    }

    /** Esc: one thing at a time, nearest first — then the reader itself. */
    private escape(): void {
        if (this.shortcuts) {
            this.closeShortcuts();
            return;
        }
        if (this.notePop) {
            this.closeNote();
            return;
        }
        if (this.searchEl) {
            this.closeSearch();
            return;
        }
        if (this.highlights?.hasPopover()) {
            this.highlights.hidePopover();
            return;
        }
        if (this.peek) {
            this.closePeek();
            return;
        }
        if (this.detours.length > 0) {
            this.backFromDetour();
            return;
        }
        if (this.panel) {
            this.panel = null;
            this.renderPanel();
            return;
        }
        // In fullscreen, Esc leaves fullscreen — the reader stays.
        if (this.ownDocument()?.fullscreenElement) {
            this.toggleFullscreen();
            return;
        }
        this.exit();
    }

    /**
     * Space: a screen further down the chapter, and the next chapter once you are at its end —
     * Shift+Space the same, backwards. Reading never needs the mouse.
     */
    private page(direction: 1 | -1): void {
        const stage = this.els?.stage;
        if (!stage || this.ended) {
            this.go(direction);
            return;
        }
        const fraction = readFraction(stage.scrollTop, stage.scrollHeight, stage.clientHeight);
        const canScroll = scrolls(stage.scrollHeight, stage.clientHeight);
        if (!canScroll || (direction > 0 ? fraction >= END_OF_CHAPTER : stage.scrollTop <= 0)) {
            this.go(direction);
            return;
        }
        this.scrollStage(direction * 0.85);
    }

    /** Scroll the page by a share of its own height — smoothly, unless motion is reduced. */
    private scrollStage(share: number): void {
        const stage = this.els?.stage;
        if (!stage) return;
        const top = Math.round((stage.clientHeight || 0) * share);
        if (typeof stage.scrollBy === "function") stage.scrollBy({ top, behavior: this.motionAllowed() ? "smooth" : "auto" });
        else stage.scrollTop = Math.max(0, stage.scrollTop + top);
    }

    // ── the shortcuts sheet ──────────────────────────────────────────────────

    private toggleShortcuts(): void {
        if (this.shortcuts) this.closeShortcuts();
        else this.openShortcuts();
    }

    private openShortcuts(): void {
        const root = this.root;
        if (!root) return;
        const sheet = root.createDiv({
            cls: c("reader-shortcuts"),
            attr: { role: "dialog", "aria-modal": "true", "aria-label": t("reader_shortcuts") },
        });
        const card = sheet.createDiv({ cls: c("reader-shortcuts-card") });
        card.createDiv({ cls: c("reader-panel-title"), text: t("reader_shortcuts") });
        const list = card.createEl("dl", { cls: c("reader-shortcuts-list") });
        for (const row of SHORTCUTS) {
            const keys = list.createEl("dt", { cls: c("reader-shortcuts-keys") });
            for (const key of row.keys) keys.createEl("kbd", { text: KBD_KEY[key] ? t(KBD_KEY[key]) : key });
            list.createEl("dd", { cls: c("reader-shortcuts-label"), text: t(row.label) });
        }
        card.createDiv({ cls: c("reader-shortcuts-hint"), text: t("reader_shortcuts_commands") });
        // Anywhere closes it: it only explains, and asks nothing.
        this.registerDomEvent(sheet, "click", () => this.closeShortcuts());
        this.shortcuts = sheet;
        this.wake();
    }

    private closeShortcuts(): void {
        this.shortcuts?.remove();
        this.shortcuts = null;
    }

    /** The window the reader is drawn in — a pop-out has its own. */
    private viewWindow(): Window | undefined {
        const win = (this.contentEl as HTMLElement & { win?: Window }).win;
        if (win) return win;
        return typeof activeWindow === "undefined" ? undefined : activeWindow;
    }

    /** Whether to animate: a window that can be asked, and a user who has not asked for less motion. */
    private motionAllowed(): boolean {
        const win = this.viewWindow();
        if (typeof win?.matchMedia !== "function") return false;
        return !win.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    /** Bring an element of the chapter into view inside the reader's own scroller, never its ancestors. */
    private scrollToEl(el: HTMLElement): void {
        const stage = this.els?.stage;
        // A mark an embed re-render threw away has no place to scroll to.
        if (!stage || el.isConnected === false) return;
        const top = el.getBoundingClientRect().top - stage.getBoundingClientRect().top + stage.scrollTop - stage.clientHeight / 3;
        stage.scrollTop = Math.max(0, top);
    }

    private ownDocument(): Document | undefined {
        return (this.contentEl as HTMLElement & { doc?: Document }).doc;
    }

    private toggleFullscreen(): void {
        const doc = this.ownDocument();
        const failed = (error: unknown) => log.debug(`[Reader] fullscreen unavailable: ${String(error)}`);
        try {
            // The whole window, not the reader's box: modals, menus, page previews and notices are
            // drawn on the document's body, and would vanish behind a fullscreen reader element.
            const request = doc?.fullscreenElement ? doc.exitFullscreen() : (doc?.body ?? this.contentEl).requestFullscreen?.();
            void request?.catch?.(failed);
        } catch (error) {
            failed(error);
        }
    }

    /** Show the bar, then let it fade when nothing moves. */
    private wake(): void {
        if (!this.root) return;
        this.root.removeClass(c("reader--idle"));
        window.clearTimeout(this.idleTimer);
        this.idleTimer = window.setTimeout(() => {
            if (!this.panel && !this.shortcuts) this.root?.addClass(c("reader--idle"));
        }, IDLE_MS);
    }
}

export { READER_VIEW };
