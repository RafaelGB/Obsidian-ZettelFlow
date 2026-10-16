import { Component, ItemView, Scope, Setting, TFile, moment as obsidianMoment, setIcon, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import type MomentFn from "moment";
import { c, log } from "architecture";
import { t, tCount } from "architecture/lang";
import {
    SHELF_FILTERS,
    SHELF_SORTS,
    STATUS_FILTERS,
    bookViewOf,
    fold,
    layShelves,
    shelfCounts,
    statusCounts,
    titleFromName,
    type BookView,
    type ShelfFilter,
    type ShelfStatus,
    type ShelfItem,
    type ShelfSort,
    type StatusFilter,
} from "application/library/shelf";
import { BOOK_LINK_KEY, TEXT_FIELDS, effectiveStatus, type BookDetails, type TextField } from "application/library/bookNote";
import {
    canMoveTo,
    normalizeShelfNames,
    placeOf,
    planDelete,
    planMove,
    planRename,
    rememberCreate,
    rememberDelete,
    rememberRename,
    validateShelfName,
    yourShelves,
    type ShelfNote,
    type ShelfTarget,
} from "application/library/shelves";
import { applyShelfWrites, realShelfWritePort, type ShelfStep, type ShelfWritePort } from "./libraryShelfWrites";
import { statusOnOpen } from "application/library/bookNote";
import { bookMenu, nameField, ownMark, reservedShelfNames, shelfMenu, type MoveChoice } from "./libraryShelves";
import { draggable, dropTarget, type DragHooks } from "./libraryDrag";
import { motionWelcome } from "architecture/components/core/reader/readerMotion";
import { isFresh, normalizeLibrary, sourceFormat, withFacts, type LibraryMeta } from "application/library/sourceMeta";
import { readFrom } from "architecture/components/core/reader/readingChooser";
import { cachedCover, readCover } from "./libraryCovers";
import { bookMarks, drawCover, drawSpine, progressRing, showCoverImage } from "./libraryCoverEl";
import { renderDetail } from "./libraryDetail";
import { renderDetails, type DetailsParts } from "./libraryDetails";
import { arriveIn, flipMove, FLIP_KEY } from "./libraryFlip";
import { addFolderField } from "config/modals/handlers/folderField";
import { ARTICLES_DEFAULT, inFolder } from "application/library/article";
import { declaredMetadata } from "./sources/declared";
import { beginOpenShot } from "architecture/components/core/reader/readerShot";
import { readingMotion } from "architecture/components/core/reader/readingMotion";
import { renderNotebook, type NotebookFilter } from "./libraryNotebook";
import { crystallizeHighlight } from "./crystallizeHighlight";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { LIBRARY_VIEW, type LibraryHost } from "./libraryHost";
import { openShelfItem, type OpenAt } from "./libraryOpen";
import { articlesFolderOf, gatherArticles, gatherShelf, type Shelf } from "./libraryShelf";
import { gatherProduced, renderProduced } from "./libraryProduced";
import { CitePanel } from "architecture/components/core/reader/readerCite";
import { citeFormOf } from "application/library/citation";
import { citeSourceOf } from "./libraryCite";
import type { KnowledgeIndex } from "architecture/knowledge";
import { afterVaultLoad } from "architecture/plugin/afterVaultLoad";

type LocaleKey = Parameters<typeof t>[0];

/** Literal maps, so the locale guardrail sees every key the shelf draws. */
const FILTER_KEY: Record<ShelfFilter, LocaleKey> = {
    all: "shelf_filter_all",
    books: "shelf_filter_books",
    papers: "shelf_filter_papers",
    articles: "shelf_filter_articles",
    paths: "shelf_filter_paths",
};
/** The shelf chips (#819): every shelf, and the status shelves by the names they stand under. */
const SHELF_CHIP_KEY: Record<StatusFilter, LocaleKey> = {
    all: "shelf_every_shelf",
    reading: "shelf_status_reading",
    "to-read": "shelf_status_to_read",
    none: "shelf_status_none",
    finished: "shelf_status_finished",
};
const SORT_KEY: Record<ShelfSort, LocaleKey> = {
    recent: "shelf_sort_recent",
    highlighted: "shelf_sort_highlighted",
    title: "shelf_sort_title",
    added: "shelf_sort_added",
};
/** What each status shelf holds, said under its name on the plank (#820). */
const SHELF_NOTE_KEY: Record<ShelfStatus, LocaleKey> = {
    reading: "shelf_note_reading",
    "to-read": "shelf_note_to_read",
    none: "shelf_note_none",
    finished: "shelf_note_finished",
};

// Obsidian re-exports its moment typed as a namespace; the callable signature is type-only.
const moment = obsidianMoment as unknown as typeof MomentFn;

/** How long the line under the bar offers to take a shelf change back (#821 FR-16). */
const UNDO_LINE_MS = 30_000;

/** A folder field left unchanged closes after its own commit would have run (see `addFolderField`). */
const FOLDER_BLUR_MS = 300;

/**
 * The sources whose *What it produced* was shown this session (#752 FR-9): the second opening is
 * simply there — also after a trip to the Reader, which draws the Library anew. Never persisted.
 */
const PRODUCED_SEEN = new Set<string>();

/** Saving what was read off the files waits for a quiet moment, so a shelf of covers saves once. */
const SAVE_MS = 800;
/** How long a detail opened at a field (#768) keeps that field through the shelf's redraw. */
const FIELD_HOLD_MS = 2000;

/** When you last read it, in the words Obsidian uses for time. */
export function lastReadLabel(at: number): string {
    return at > 0 ? moment(at).fromNow() : t("shelf_never_opened");
}

/** Where you are in it, as a reader says it: a page of a paper, a chapter of a book, a note of a path. */
export function whereLabel(item: ShelfItem): string {
    if (item.place === undefined || !item.chapters) return "";
    const at = String(item.place + 1);
    const of = String(item.chapters);
    if (item.format === "pdf") return t("shelf_where_page", at, of);
    if (item.format === "epub") return t("shelf_where_chapter", at, of);
    if (item.format === "article") return t("shelf_where_section", at, of);
    return t("shelf_where_note", at, of);
}

/**
 * **Your Library** (#680, epic #675) — the sources your ideas come from.
 *
 * A bookshelf of the PDFs and EPUBs already in your vault (L1) and the reading paths you saved
 * across your notes, each with what came of it: how far you are, what you marked and the notes
 * born from it. *Continue reading* leads, because it is the reason to open the Library. A surface
 * with a rank-1 door — the ribbon menu (L7) — in the main area, laid out to work as well in a
 * narrow pane or a sidebar.
 *
 * It writes no note. What it remembers about a source — the title the file declares, its length,
 * where you are — is kept in plugin data; the files are never touched (L5).
 */
export class LibraryView extends ItemView {
    private filter: ShelfFilter = "all";
    private sort: ShelfSort = "recent";
    private search = "";
    /** Where things stand for you, and one collection (#743): the second row of chips. */
    private status: StatusFilter = "all";
    private collection: string | null = null;
    /** The search field of the bar that stays (#819): `/` finds it. */
    private searchInput: HTMLInputElement | null = null;
    /** *+ New shelf* is open, or the shelf (by its name) being renamed (#821). */
    private naming: { kind: "new" } | { kind: "rename"; name: string } | null = null;
    /** What each shelf drawn takes, by its element (#821): where a dropped book goes. */
    private bayTargets = new WeakMap<HTMLElement, ShelfTarget>();
    /** The line that says what a shelf change did, with its Undo (#821 FR-16) — never a toast. */
    private shelfMessage: { text: string; until: number; batch?: string; names?: string[]; failed?: boolean } | null = null;
    /** The bar that stays, and the shelves under it (#819): where a result starts. */
    private bar: HTMLElement | null = null;
    private shelfHost: HTMLElement | null = null;
    /** What *Recently added* last drew (#744 FR-13): a card new since then settles in. `null` before the first draw. */
    private drawnBooks: Set<string> | null = null;
    /** How far along each shelf you had scrolled (#820): a redraw puts every shelf back where it was. */
    private readonly shelfLeft = new Map<string, number>();
    /** The book you came back from (#820 AC-19): its shelf is turned to it once drawn. */
    private pendingFocus: string | null = null;
    /** The one card that rises over a book (#820 FR-16), outside every scrolling shelf. */
    private tip: HTMLElement | null = null;
    /** The inline *Change* of the articles folder is open (#744 FR-2). */
    private changingFolder = false;
    /** A refresh waiting to run keeps an open detail as it is (#743). */
    private keepDetail = false;
    private detail: string | null = null;
    /**
     * One-shot (#768 FR-4): the Details field the detail opens at — Cite's *Add it*. Held for the
     * moment the shelf takes to arrive, which draws the detail a second time, then let go.
     */
    private openField: { field: TextField; detail: string; until: number } | null = null;
    /** *Cite this book* (#768): the one cite panel, grown from the detail's button. */
    private citePanel: CitePanel | null = null;
    /** The source whose notebook is open instead of the shelf (#721). */
    private notebook: string | null = null;
    /** The Library came back into view: the continue card breathes once (#724). */
    private welcomeBack = false;
    /** Back from the Reader (#733): the scroll to land on once the shelf is drawn. One-shot. */
    private pendingScroll: number | null = null;
    private notebookFilter: NotebookFilter = { meaning: null, withNotes: false };
    private notebookScope: Component | null = null;
    private shelf: Shelf = { items: [], born: new Map(), meta: {}, notes: new Map() };
    private root: HTMLElement | null = null;
    private body: HTMLElement | null = null;
    private aside: HTMLElement | null = null;
    private scrim: HTMLElement | null = null;
    /** The listeners of one render of the shelf; dropped with the next. */
    private renderScope: Component | null = null;
    private detailScope: Component | null = null;
    private observer: IntersectionObserver | null = null;
    private readonly pendingCovers = new WeakMap<Element, ShelfItem>();
    private saveTimer: number | undefined;
    private refreshTimer: number | undefined;

    constructor(
        leaf: WorkspaceLeaf,
        private readonly plugin?: LibraryHost,
        /** Seams for tests: the thought store the notebook reads, the writes and suggests of Details. */
        private readonly deps: {
            store?: Pick<ThoughtStore, "highlightsAbout">;
            details?: Pick<DetailsParts, "port" | "suggest">;
            /** Your shelves' writes and the shelf under a finger (#821). */
            shelves?: { port?: ShelfWritePort; bayAt?: DragHooks["bayAt"] };
            produced?: { store?: Pick<ThoughtStore, "thoughtsAbout">; index?: Pick<KnowledgeIndex, "status" | "getModel"> };
        } = {}
    ) {
        super(leaf);
        this.scope = new Scope(this.app?.scope);
        // `/` finds the search (#819 FR-3), on the shelf only — never while typing, never over the detail.
        this.scope.register([], "/", (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const typing = Boolean(target?.closest?.("input, textarea, select, [contenteditable=true]"));
            if (typing || this.detail || this.notebook || !this.searchInput) return true;
            this.searchInput.focus();
            return false;
        });
        // Esc closes the detail, then the notebook; with neither open it is Obsidian's.
        this.scope.register([], "Escape", () => {
            // The cite panel is the nearest thing: it goes first, and the detail stays (#768 FR-10).
            if (this.citePanel?.isOpen()) {
                this.citePanel.close();
                return false;
            }
            if (!this.detail && this.notebook) {
                this.closeNotebook();
                return false;
            }
            if (!this.detail) return true;
            this.closeDetail();
            return false;
        });
    }

    /** A literal: `ItemView` calls this from its own constructor, before any field exists (#278). */
    getViewType(): string {
        return "zettelflow-library";
    }

    getDisplayText(): string {
        return t("shelf_title");
    }

    getIcon(): string {
        return "library";
    }

    getState(): Record<string, unknown> {
        return {
            ...super.getState(),
            filter: this.filter,
            sort: this.sort,
            ...(this.status !== "all" ? { status: this.status } : {}),
            ...(this.collection ? { shelf: this.collection } : {}),
            ...(this.detail ? { detail: this.detail } : {}),
            ...(this.notebook ? { notebook: this.notebook } : {}),
        };
    }

    async setState(state: unknown, result: ViewStateResult): Promise<void> {
        await super.setState(state, result);
        const value = (state ?? {}) as Record<string, unknown>;
        if (typeof value.filter === "string" && (SHELF_FILTERS as readonly string[]).includes(value.filter)) this.filter = value.filter as ShelfFilter;
        if (typeof value.sort === "string" && (SHELF_SORTS as readonly string[]).includes(value.sort)) this.sort = value.sort as ShelfSort;
        this.status = typeof value.status === "string" && (STATUS_FILTERS as readonly string[]).includes(value.status) ? (value.status as StatusFilter) : "all";
        // A collection saved by an earlier Library opens on every shelf (#819 AC-11); a shelf of yours is kept (#821).
        this.collection = typeof value.shelf === "string" && value.shelf ? value.shelf : null;
        if (this.collection) this.status = "all";
        this.detail = typeof value.detail === "string" && value.detail ? value.detail : null;
        this.openField =
            this.detail && typeof value.field === "string" && (TEXT_FIELDS as readonly string[]).includes(value.field) ? { field: value.field as TextField, detail: this.detail, until: Date.now() + FIELD_HOLD_MS } : null;
        const notebook = typeof value.notebook === "string" && value.notebook ? value.notebook : null;
        if (notebook !== this.notebook) this.notebookFilter = { meaning: null, withNotes: false };
        this.notebook = notebook;
        if (typeof value.scroll === "number" && Number.isFinite(value.scroll) && value.scroll >= 0) this.pendingScroll = value.scroll;
        this.pendingFocus = typeof value.focus === "string" && value.focus ? value.focus : null;
        if (this.root) this.refresh();
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass(c("shelf-host"));
        this.root = this.contentEl.createDiv({ cls: c("shelf") });
        this.body = this.root.createDiv({ cls: c("shelf-body") });
        // The bar draws its hairline once the shelves scroll under it (#819 MF-1), and not before.
        let under = false;
        this.registerDomEvent(
            this.contentEl,
            "scroll",
            () => {
                const now = this.contentEl.scrollTop > 0;
                if (now === under) return;
                under = now;
                this.contentEl.toggleClass(c("shelf-host--under"), now);
            },
            { passive: true }
        );
        // The dim and the detail live beside the shelf's scroller, not in it (#779): placed over the pane
        // you see, they cover it whatever the shelf's scroll, and the shelf waits under them.
        this.scrim?.remove();
        this.aside?.remove();
        this.scrim = this.containerEl.createDiv({ cls: c("shelf-scrim") });
        this.registerDomEvent(this.scrim, "click", () => this.closeDetail());
        this.aside = this.containerEl.createEl("aside", {
            cls: c("shelf-detail"),
            attr: { "aria-label": t("shelf_details"), role: "dialog" },
        });
        // The view's own window's observer: a pop-out window has its own.
        const win = (this.contentEl as HTMLElement & { win?: Window }).win ?? (typeof activeWindow === "undefined" ? undefined : activeWindow);
        const Observer = (win as unknown as { IntersectionObserver?: typeof IntersectionObserver } | undefined)?.IntersectionObserver;
        if (Observer) {
            this.observer = new Observer((entries) => this.onCoversVisible(entries), { root: this.contentEl, rootMargin: "200px 0px" });
            this.register(() => this.observer?.disconnect());
        }
        // A source added, renamed or removed is on the shelf the moment the vault says so — and an
        // article, in the articles folder (#744); a new one is read once the cache has its properties.
        const onVault = (file: unknown) => {
            if (file instanceof TFile && (sourceFormat(file.path) || this.inArticles(file.path))) this.scheduleRefresh();
        };
        // Not the vault load's own flood, which announces every file (#795).
        this.registerEvent(this.app.vault.on("create", afterVaultLoad(this.app, onVault)));
        this.registerEvent(this.app.vault.on("delete", onVault));
        this.registerEvent(
            this.app.vault.on("rename", (file, oldPath) => {
                if (!(file instanceof TFile)) return;
                // What the Library knew of it follows it from the plugin's own listener (#810), with
                // the shelf closed too; here the shelf only shows it. An article moved into, or out
                // of, the articles folder comes, or goes (#744).
                if (this.inArticles(file.path) || this.inArticles(oldPath) || sourceFormat(file.path)) this.scheduleRefresh();
            })
        );
        // A book's note changed — here, in its editor, in a Base (#743): the shelf follows it, and a
        // detail you are typing in is left alone.
        const onNote = (file: unknown) => {
            if (!(file instanceof TFile) || file.extension !== "md") return;
            const known = [...this.shelf.notes.values()].some((note) => note.path === file.path);
            const fm = this.app.metadataCache.getFileCache?.(file)?.frontmatter;
            if (known || (fm && BOOK_LINK_KEY in fm) || this.inArticles(file.path)) this.scheduleRefresh(true);
        };
        if (typeof this.app.metadataCache?.on === "function") this.registerEvent(this.app.metadataCache.on("changed", onNote));
        this.registerEvent(this.app.vault.on("delete", onNote));
        // Back from the Reader, the counts and the place have moved.
        this.registerEvent(
            this.app.workspace.on("active-leaf-change", (leaf) => {
                if (leaf === this.leaf) {
                    this.welcomeBack = true;
                    this.scheduleRefresh();
                }
            })
        );
        this.refresh();
    }

    async onClose(): Promise<void> {
        window.clearTimeout(this.refreshTimer);
        if (this.saveTimer !== undefined) {
            window.clearTimeout(this.saveTimer);
            void this.plugin?.saveSettings?.();
        }
        this.renderScope?.unload();
        this.detailScope?.unload();
        this.citePanel?.dispose();
        this.citePanel = null;
        this.scrim?.remove();
        this.aside?.remove();
        this.contentEl.empty();
        this.root = null;
    }

    /**
     * Read the shelf again and draw it. `keepDetail`: a book's note changed under an open detail —
     * the shelf follows, the detail you are typing in is not redrawn under you (#743).
     */
    refresh(keepDetail = false): void {
        if (!this.body) return;
        this.shelf = gatherShelf(this.app, this.plugin ?? null);
        if (this.notebook && this.renderNotebookPage()) return;
        this.notebook = null;
        // Something arrived while the shelf was open (#744 FR-13): the row makes room for it by a translate.
        const known = this.drawnBooks;
        const arrived = known !== null && this.shelf.items.some((item) => !known.has(item.id));
        if (arrived) flipMove(this.body, () => this.render());
        else this.render();
        // The kept place first (#779): a detail opened from view state covers the pane you see there.
        if (this.pendingScroll !== null) {
            this.contentEl.scrollTop = this.pendingScroll;
            this.pendingScroll = null;
        }
        // And along its shelf, in the same pass (#820 AC-19): the closing shot finds the book still.
        if (this.pendingFocus !== null) {
            this.turnShelfTo(this.pendingFocus);
            this.pendingFocus = null;
        }
        const showing = this.aside?.hasClass(c("shelf-detail--open")) === true;
        if (this.detail && !(keepDetail && showing)) this.openDetail(this.detail);
    }

    /** Whether a path is in the articles folder (#744). */
    private inArticles(path: string): boolean {
        return inFolder(path, articlesFolderOf(this.plugin));
    }

    private scheduleRefresh(keepDetail = false): void {
        // A full refresh already waiting wins over keeping the detail.
        this.keepDetail = keepDetail && (this.refreshTimer === undefined || this.keepDetail);
        window.clearTimeout(this.refreshTimer);
        this.refreshTimer = window.setTimeout(() => {
            this.refreshTimer = undefined;
            this.refresh(this.keepDetail);
        }, 150);
    }

    // ── the shelf ────────────────────────────────────────────────────────────

    private render(): void {
        const body = this.body;
        if (!body) return;
        // The control you pressed keeps the focus through the redraw (#819 FR-22).
        const focused = (body.ownerDocument?.activeElement as HTMLElement | null | undefined)?.closest?.("[data-zf-control]")?.getAttribute("data-zf-control") ?? null;
        body.empty();
        this.renderScope?.unload();
        const scope = new Component();
        scope.load();
        this.renderScope = scope;
        this.observer?.disconnect();

        const items = this.shelf.items;
        if (items.length === 0) {
            const head = body.createDiv({ cls: c("shelf-head") });
            const titles = head.createDiv({ cls: c("shelf-titles") });
            titles.createEl("h1", { cls: c("shelf-heading"), text: t("shelf_title") });
            this.renderEmpty(body, scope);
            return;
        }

        // The bar that stays (#819): where you search, what you see and how, fixed over the shelves.
        const bar = body.createDiv({ cls: c("shelf-bar"), attr: { role: "search" } });
        const top = bar.createDiv({ cls: c("shelf-bar-top") });
        top.createEl("h1", { cls: c("shelf-heading"), text: t("shelf_title") });
        const search = top.createEl("label", { cls: c("shelf-search") });
        setIcon(search.createSpan({ cls: c("shelf-search-icon") }), "search");
        const input = search.createEl("input", {
            cls: c("shelf-search-input"),
            attr: { type: "search", placeholder: t("shelf_search"), "aria-label": t("shelf_search"), spellcheck: "false" },
        });
        // Where a key is there to press, the key that finds (FR-3): a hint, never on a touch screen.
        search.createEl("kbd", { cls: c("shelf-search-key"), text: "/", attr: { "aria-hidden": "true" } });
        input.value = this.search;
        this.searchInput = input;
        scope.registerDomEvent(input, "input", () => {
            this.search = input.value;
            this.renderShelf(shelfHost, scope);
        });
        this.renderViewSwitch(top, scope);

        // One row of chips (#819 FR-6): what kind of thing, then which shelf — then the order.
        const chips = bar.createDiv({ cls: c("shelf-chips") });
        const kinds = chips.createDiv({ cls: c("shelf-chip-group"), attr: { role: "group", "aria-label": t("shelf_kind_row") } });
        const counts = shelfCounts(items);
        for (const filter of SHELF_FILTERS) {
            const on = filter === this.filter;
            const chip = kinds.createEl("button", {
                cls: [c("shelf-filter"), c("shelf-filter--kind"), ...(on ? ["is-active"] : [])],
                attr: { type: "button", "aria-pressed": String(on), "data-zf-control": `kind:${filter}` },
            });
            chip.createSpan({ text: t(FILTER_KEY[filter]) });
            chip.createSpan({ cls: c("shelf-filter-count"), text: String(counts[filter]) });
            scope.registerDomEvent(chip, "click", () => {
                this.filter = filter;
                this.app.workspace.requestSaveLayout();
                this.render();
                this.snapUnderBar();
            });
        }
        chips.createSpan({ cls: c("shelf-chips-sep"), attr: { "aria-hidden": "true" } });
        this.renderShelfChips(chips, scope);
        const sort = chips.createEl("select", { cls: ["dropdown", c("shelf-sort")], attr: { "aria-label": t("shelf_sort_label"), "data-zf-control": "sort" } });
        for (const option of SHELF_SORTS) sort.createEl("option", { text: t(SORT_KEY[option]), attr: { value: option } });
        sort.value = this.sort;
        scope.registerDomEvent(sort, "change", () => {
            this.sort = sort.value as ShelfSort;
            this.app.workspace.requestSaveLayout();
            this.renderShelf(shelfHost, scope);
            this.snapUnderBar();
        });

        // What the last shelf change did, and its Undo (#821): in the bar, so it is there however far you scrolled.
        this.renderShelfMessage(bar, scope);
        // Where articles come from (#744) is the Articles chip's own line, under the bar (FR-9).
        if (this.filter === "articles") this.renderArticlesFrom(body, scope);
        const shelfHost = body.createDiv({ cls: c("shelf-shelf-host") });
        this.bar = bar;
        this.shelfHost = shelfHost;
        this.renderShelf(shelfHost, scope);
        if (focused) body.querySelector<HTMLElement>(`[data-zf-control="${focused}"]`)?.focus({ preventScroll: true });
    }

    /**
     * After a chip or the order changes (#819 FR-23): when you were further down than the shelves'
     * top, the result starts under the bar; at the top, nothing moves.
     */
    private snapUnderBar(): void {
        const bar = this.bar;
        const host = this.shelfHost;
        if (!bar || !host) return;
        const top = host.offsetTop - bar.offsetHeight;
        if (this.contentEl.scrollTop > top) this.contentEl.scrollTop = Math.max(0, top);
    }

    /**
     * The shelf chips (#819 FR-6): **Every shelf**, then the status shelves in the order they stand —
     * Reading · Want to read · On the shelf · Finished — each once something stands there (or it is
     * the one chosen). Your own shelves join this row with #821; it has their place already.
     */
    private renderShelfChips(row: HTMLElement, scope: Component): void {
        const items = this.shelf.items;
        const group = row.createDiv({ cls: c("shelf-chip-group"), attr: { role: "group", "aria-label": t("shelf_status_row") } });
        const counts = statusCounts(items);
        for (const status of STATUS_FILTERS) {
            if (status !== "all" && counts[status] === 0 && this.status !== status) continue;
            const on = status === this.status && !this.collection;
            const chip = group.createEl("button", {
                cls: [c("shelf-filter"), c("shelf-filter--status"), ...(on ? ["is-active"] : [])],
                attr: { type: "button", "aria-pressed": String(on), "data-zf-control": `shelf:${status}` },
                text: t(SHELF_CHIP_KEY[status]),
            });
            scope.registerDomEvent(chip, "click", () => {
                this.status = status;
                this.collection = null;
                this.app.workspace.requestSaveLayout();
                this.render();
                this.snapUnderBar();
            });
        }
        // Your own shelves, A→Z, and + New shelf (#821).
        const slot = row.createDiv({ cls: c("shelf-own-slot"), attr: { role: "group", "aria-label": t("shelf_yours") } });
        for (const name of this.ownNames()) {
            const on = this.collection !== null && fold(this.collection) === fold(name);
            const chip = slot.createEl("button", {
                cls: [c("shelf-filter"), c("shelf-filter--own"), ...(on ? ["is-active"] : [])],
                attr: { type: "button", "aria-pressed": String(on), "data-zf-control": `own:${name}` },
            });
            ownMark(chip);
            chip.createSpan({ text: name });
            scope.registerDomEvent(chip, "click", () => {
                this.collection = name;
                this.status = "all";
                this.app.workspace.requestSaveLayout();
                this.render();
                this.snapUnderBar();
            });
        }
        if (this.naming?.kind === "new") {
            const input = nameField(slot, scope, {
                check: (raw) => this.whyNotName(raw),
                commit: (raw) => this.createShelf(raw),
                cancel: () => {
                    this.naming = null;
                    this.render();
                },
            });
            window.setTimeout(() => input.focus(), 0);
            return;
        }
        const add = slot.createEl("button", {
            cls: [c("shelf-filter"), c("shelf-filter--new")],
            attr: { type: "button", "data-zf-control": "own:+" },
            text: t("shelf_new"),
        });
        scope.registerDomEvent(add, "click", () => {
            this.naming = { kind: "new" };
            this.render();
        });
    }

    // ── your shelves (#821) ──────────────────────────────────────────────────

    /** Your shelves, A→Z: the ones you made and every one a book is on. */
    private ownNames(): string[] {
        return yourShelves(normalizeShelfNames(this.plugin?.settings?.libraryShelves), this.shelf.items);
    }

    /** Why a name cannot be a shelf of yours — or null. */
    private whyNotName(raw: string, keep?: string): string | null {
        const check = validateShelfName(raw, this.ownNames(), reservedShelfNames(), keep);
        if (check.ok) return null;
        if (check.reason === "empty") return t("shelf_name_empty");
        if (check.reason === "taken") return t("shelf_name_taken", check.name);
        return t("shelf_name_reserved", check.name);
    }

    /** Remember the shelves you made, in plugin data — never a vault write. */
    private rememberShelves(names: string[]): void {
        const settings = this.plugin?.settings;
        if (!settings) return;
        settings.libraryShelves = names;
        void this.plugin?.saveSettings?.()?.catch?.((error: unknown) => log.error(`[Library] could not save: ${String(error)}`));
    }

    private shelfPort(): ShelfWritePort {
        return this.deps.shelves?.port ?? this.deps.details?.port ?? realShelfWritePort;
    }

    /** *+ New shelf*: an empty shelf of yours stands, with room for books. Nothing is written to the vault. */
    private createShelf(raw: string): void {
        const check = validateShelfName(raw, this.ownNames(), reservedShelfNames());
        if (!check.ok) return;
        this.naming = null;
        this.rememberShelves(rememberCreate(normalizeShelfNames(this.plugin?.settings?.libraryShelves), check.name));
        this.collection = null;
        this.status = "all";
        this.render();
        const bay = [...(this.body?.querySelectorAll<HTMLElement>(`.${c("shelf-bay")}`) ?? [])].find((el) => el.getAttribute("data-zf-shelf") === `own:${check.name}`);
        if (bay) {
            arriveIn(bay);
            bay.scrollIntoView?.({ block: "nearest", behavior: motionWelcome(bay) ? "smooth" : "auto" });
        }
    }

    /** Where a book can go, the shelf it stands on checked: the status shelves, then yours. */
    private moveChoices(item: ShelfItem): MoveChoice[] {
        const place = placeOf(item);
        const choices: MoveChoice[] = [];
        for (const status of STATUS_FILTERS) {
            if (status === "all") continue;
            const target: ShelfTarget = { kind: "status", status };
            const current = place.kind === "status" && place.status === status;
            if (!current && !canMoveTo(item, target)) continue;
            choices.push({ target, label: t(SHELF_CHIP_KEY[status]), current });
        }
        for (const name of this.ownNames()) {
            const current = place.kind === "own" && fold(place.name) === fold(name);
            choices.push({ target: { kind: "own", name }, label: name, current });
        }
        return choices;
    }

    /** Put a book on a shelf: one recorded batch, the book carried there, and an Undo beside the bar. */
    private async moveBook(item: ShelfItem, target: ShelfTarget): Promise<void> {
        const change = planMove(item, target);
        if (!change) return;
        const names = normalizeShelfNames(this.plugin?.settings?.libraryShelves);
        const where = target.kind === "own" ? target.name : t(SHELF_CHIP_KEY[target.status]);
        await this.writeShelves([{ kind: "move", item, change }], t("shelf_moved", where), names, () => {
            if (target.kind === "own") this.rememberShelves(rememberCreate(names, target.name));
        });
    }

    /** The notes your shelves are written in: book notes, and articles. */
    private shelfNotes(): ShelfNote[] {
        return this.shelf.items
            .filter((item) => item.note && (item.collections?.length ?? 0) > 0)
            .map((item) => ({ path: item.note!, article: item.kind === "article", collections: item.collections ?? [] }));
    }

    private async renameShelf(from: string, raw: string): Promise<void> {
        const check = validateShelfName(raw, this.ownNames(), reservedShelfNames(), from);
        this.naming = null;
        if (!check.ok || check.name === from) {
            this.render();
            return;
        }
        const names = normalizeShelfNames(this.plugin?.settings?.libraryShelves);
        const steps: ShelfStep[] = planRename(this.shelfNotes(), from, check.name).map((edit) => ({ kind: "edit", edit }));
        if (this.collection && fold(this.collection) === fold(from)) this.collection = check.name;
        await this.writeShelves(steps, t("shelf_renamed", check.name), names, () => this.rememberShelves(rememberRename(names, from, check.name)));
    }

    private async deleteShelf(name: string): Promise<void> {
        const names = normalizeShelfNames(this.plugin?.settings?.libraryShelves);
        const steps: ShelfStep[] = planDelete(this.shelfNotes(), name).map((edit) => ({ kind: "edit", edit }));
        if (this.collection && fold(this.collection) === fold(name)) this.collection = null;
        await this.writeShelves(steps, t("shelf_deleted", name), names, () => this.rememberShelves(rememberDelete(names, name)));
    }

    /**
     * Write a shelf change in one batch, show it at once — before the metadata cache catches up — and
     * offer its Undo on the line under the bar. A failure says so there, and nothing is half-shown.
     */
    private async writeShelves(steps: ShelfStep[], said: string, names: string[], remember: () => void): Promise<void> {
        let result: Awaited<ReturnType<typeof applyShelfWrites>> = { batch: undefined, written: [] };
        try {
            if (steps.length > 0) {
                result = await applyShelfWrites(steps, this.shelfPort(), {
                    folder: () => this.plugin?.settings?.bookNotesFolder || "Library",
                    declared: (item) => async () => {
                        const file = item.file ? this.app.vault.getAbstractFileByPath(item.file) : null;
                        return file instanceof TFile ? declaredMetadata(this.app, file) : {};
                    },
                }, said);
            }
        } catch (error) {
            log.error(`[Library] could not change the shelf: ${String(error)}`);
            this.shelfMessage = { text: t("shelf_write_failed"), until: Date.now() + UNDO_LINE_MS, failed: true };
            this.render();
            return;
        }
        remember();
        for (const written of result.written) this.updateItem(written.id, written.details, written.note);
        for (const step of steps) {
            if (step.kind !== "edit") continue;
            const at = this.shelf.items.findIndex((item) => item.note === step.edit.path);
            const item = this.shelf.items[at];
            if (!item) continue;
            const details: BookDetails = { ...item.details };
            const next: ShelfItem = { ...item, details };
            if (step.edit.collections) {
                details.collections = [...step.edit.collections];
                next.collections = [...step.edit.collections];
            } else {
                delete details.collections;
                delete next.collections;
            }
            this.shelf.items[at] = next;
        }
        this.shelfMessage = { text: said, until: Date.now() + UNDO_LINE_MS, ...(result.batch ? { batch: result.batch } : {}), names };
        if (this.body) flipMove(this.body, () => this.render());
    }

    /** Undo the last shelf change: the notes as they were, and the shelves you had. */
    private async undoShelves(): Promise<void> {
        const message = this.shelfMessage;
        if (!message) return;
        this.shelfMessage = null;
        if (message.names) this.rememberShelves(message.names);
        if (message.batch) {
            try {
                await this.shelfPort().undo(message.batch);
            } catch (error) {
                log.error(`[Library] could not undo the shelf change: ${String(error)}`);
            }
        }
        this.shelfMessage = { text: t("shelf_details_undone"), until: Date.now() + UNDO_LINE_MS };
        this.refresh();
    }

    /** The line under the bar: what the last shelf change did, and its Undo. */
    private renderShelfMessage(body: HTMLElement, scope: Component): void {
        const message = this.shelfMessage;
        if (!message || message.until < Date.now()) {
            this.shelfMessage = null;
            return;
        }
        const line = body.createDiv({ cls: [c("shelf-message"), ...(message.failed ? [c("shelf-message--failed")] : [])], attr: { role: "status" } });
        line.createSpan({ text: message.text });
        if (!message.batch && !message.names) return;
        const undo = line.createEl("button", { cls: c("shelf-message-undo"), attr: { type: "button" }, text: t("changes_undo") });
        scope.registerDomEvent(undo, "click", () => void this.undoShelves());
    }

    /** The hands that put books on shelves: which shelf takes which book, and what a drop does. */
    private dragHooks(): DragHooks {
        return {
            canDrop: (item, bay) => {
                const target = this.bayTargets.get(bay);
                return Boolean(target && canMoveTo(item, target));
            },
            drop: (item, bay) => {
                const target = this.bayTargets.get(bay);
                if (target) void this.moveBook(item, target);
            },
            ...(this.deps.shelves?.bayAt ? { bayAt: this.deps.shelves.bayAt } : {}),
            layer: () => this.root,
        };
    }

    /** The book's menu, from its ⋯ or a right click: Details, and Move to shelf… for what can move. */
    private openBookMenu(item: ShelfItem, at: MouseEvent | HTMLElement): void {
        const movable = item.kind !== "path" && Boolean(item.file);
        bookMenu(at, {
            details: () => this.openDetail(item.id),
            ...(movable ? { move: () => this.moveChoices(item) } : {}),
            choose: (target) => void this.moveBook(item, target),
        });
    }

    /** Covers or spines: the setting's one value (#819 FR-8), covers until you choose. */
    private bookView(): BookView {
        return bookViewOf(this.plugin?.settings?.libraryBookView);
    }

    private setBookView(view: BookView): void {
        if (view === this.bookView() || !this.plugin?.settings) return;
        this.plugin.settings.libraryBookView = view;
        void this.plugin.saveSettings?.()?.catch?.((error: unknown) => log.error(`[Library] could not save: ${String(error)}`));
        this.render();
    }

    /** Covers | Spines (#819 FR-8): placed here; what it does is the shelves' own (#820). */
    private renderViewSwitch(parent: HTMLElement, scope: Component): void {
        const group = parent.createDiv({ cls: c("shelf-view-switch"), attr: { role: "group", "aria-label": t("shelf_view_label") } });
        for (const view of ["covers", "spines"] as const) {
            const on = view === this.bookView();
            const button = group.createEl("button", {
                cls: [c("shelf-view-option"), ...(on ? ["is-active"] : [])],
                attr: { type: "button", "aria-pressed": String(on), "data-view": view, "data-zf-control": `view:${view}` },
                text: t(view === "covers" ? "shelf_view_covers" : "shelf_view_spines"),
            });
            scope.registerDomEvent(button, "click", () => this.setBookView(view));
        }
    }

    /**
     * Where articles come from (#744 FR-2), under the *Articles* chip: the folder, and *Change* — an
     * inline folder field, the same setting as Settings → Reading. Empty turns articles off.
     */
    private renderArticlesFrom(body: HTMLElement, scope: Component): void {
        const line = body.createDiv({ cls: c("shelf-articles-from") });
        const settings = this.plugin?.settings;
        if (this.changingFolder && settings) {
            const setting = new Setting(line).setName(t("shelf_articles_folder"));
            setting.settingEl?.addClass(c("shelf-articles-field"));
            addFolderField(setting, {
                read: () => articlesFolderOf(this.plugin),
                // Empty is a choice: no articles on the shelf.
                accept: (value) => {
                    settings.articlesFolder = value.replace(/^\/+|\/+$/g, "");
                    return true;
                },
                saved: async () => {
                    this.changingFolder = false;
                    await this.plugin?.saveSettings?.();
                    this.refresh();
                },
                placeholder: ARTICLES_DEFAULT,
            });
            const input = line.querySelector?.<HTMLInputElement>("input");
            input?.focus?.();
            // Left as it was — Esc, or leaving the field unchanged — the line comes back as it was.
            const putAway = () => {
                if (!this.changingFolder) return;
                this.changingFolder = false;
                this.render();
            };
            if (input) {
                scope.registerDomEvent(input, "keydown", (event: KeyboardEvent) => {
                    if (event.key !== "Escape") return;
                    event.preventDefault();
                    event.stopPropagation();
                    putAway();
                });
                scope.registerDomEvent(input, "blur", () => {
                    window.setTimeout(() => {
                        if (input.value.trim().replace(/^\/+|\/+$/g, "") === articlesFolderOf(this.plugin)) putAway();
                    }, FOLDER_BLUR_MS);
                });
            }
            return;
        }
        const folder = articlesFolderOf(this.plugin);
        line.createSpan({ text: folder ? t("shelf_articles_from", folder) : t("shelf_articles_off") });
        line.createSpan({ cls: c("shelf-articles-dot"), text: "·", attr: { "aria-hidden": "true" } });
        const change = line.createEl("button", { cls: c("shelf-articles-change"), text: t("shelf_articles_change"), attr: { type: "button" } });
        scope.registerDomEvent(change, "click", () => {
            this.changingFolder = true;
            this.render();
        });
    }

    /**
     * **The desk and the shelves** (#820) — what the search and the order redraw. What you are
     * reading lies open on the desk; every other book stands on the shelf of its status, on a plank
     * with its name on the edge, at a real size, one row that scrolls sideways when it is long.
     */
    private renderShelf(host: HTMLElement, scope: Component): void {
        host.empty();
        this.observer?.disconnect();
        const query = { filter: this.filter, sort: this.sort, search: this.search, status: this.status, collection: this.collection };
        const { desk, shelves } = layShelves(this.shelf.items, query, this.ownNames());
        // Books are put on shelves where every shelf stands (#821 FR-13); Move to shelf… works everywhere.
        const hooks = this.status === "all" && !this.collection ? this.dragHooks() : null;
        const known = this.drawnBooks;
        this.drawnBooks = new Set(this.shelf.items.map((item) => item.id));
        const tip = host.createDiv({ cls: c("shelf-tip"), attr: { "aria-hidden": "true" } });
        this.tip = tip;
        if (desk.length === 0 && shelves.length === 0) {
            // No articles yet: the line under the chip already says where they come from (#744).
            if (this.filter !== "articles" || this.search.trim()) host.createDiv({ cls: c("shelf-no-match"), text: t("shelf_no_match", this.search.trim()) });
            return;
        }
        if (desk.length > 0) {
            const section = host.createEl("section", { cls: c("shelf-desk"), attr: { "aria-label": t("shelf_desk_label") } });
            for (const item of desk) this.renderDeskCard(section, item, scope);
        }
        const spines = this.bookView() === "spines";
        for (const { key, status, own, items } of shelves) {
            const name = own ?? t(SHELF_CHIP_KEY[status ?? "none"]);
            const bay = host.createEl("section", {
                cls: [c("shelf-bay"), ...(own ? [c("shelf-bay--own")] : []), ...(spines ? [c("shelf-bay--spines")] : [])],
                attr: { "aria-label": name, "data-zf-shelf": own ? `own:${own}` : (status ?? "none") },
            });
            this.bayTargets.set(bay, own ? { kind: "own", name: own } : { kind: "status", status: status ?? "none" });
            if (hooks) dropTarget(bay, hooks, scope);
            const row = bay.createDiv({ cls: c("shelf-books"), attr: { role: "list", "data-zf-scroll": key } });
            for (const item of items) {
                const book = this.renderBook(row, item, scope, spines, hooks);
                // A book new since the last draw settles in; the first draw is still (FR-13).
                if (known && !known.has(item.id)) arriveIn(book);
            }
            // A shelf of yours with nothing on it yet says what it is for.
            if (items.length === 0) row.createDiv({ cls: c("shelf-drop-hint"), text: t("shelf_empty_hint") });
            const plank = bay.createDiv({ cls: c("shelf-plank") });
            if (own && this.naming?.kind === "rename" && fold(this.naming.name) === fold(own)) {
                const label = plank.createSpan({ cls: [c("shelf-label"), c("shelf-label--naming")] });
                const input = nameField(label, scope, {
                    value: own,
                    check: (raw) => this.whyNotName(raw, own),
                    commit: (raw) => void this.renameShelf(own, raw),
                    cancel: () => {
                        this.naming = null;
                        this.render();
                    },
                });
                window.setTimeout(() => input.focus(), 0);
            } else {
                const label = plank.createSpan({ cls: c("shelf-label") });
                if (own) ownMark(label);
                label.createSpan({ text: name });
                label.createEl("small", { text: own ? t("shelf_yours") : t(SHELF_NOTE_KEY[status ?? "none"]) });
                if (own) {
                    const more = label.createEl("button", { cls: ["clickable-icon", c("shelf-label-more")], attr: { type: "button", "aria-label": t("shelf_label_menu") } });
                    setIcon(more, "more-horizontal");
                    scope.registerDomEvent(more, "click", (event: MouseEvent) =>
                        shelfMenu(event.clientX || event.clientY ? event : more, {
                            rename: () => {
                                this.naming = { kind: "rename", name: own };
                                this.render();
                            },
                            remove: () => void this.deleteShelf(own),
                        })
                    );
                }
            }
            // Where you are along this shelf, kept through every redraw (MF-5).
            const left = this.shelfLeft.get(key);
            if (left) row.scrollLeft = left;
            scope.registerDomEvent(
                row,
                "scroll",
                () => {
                    this.shelfLeft.set(key, row.scrollLeft);
                    this.hideTip();
                },
                { passive: true }
            );
        }
    }

    /**
     * A book on a shelf (#820): the cover — or the spine — and nothing under it. Its title, its
     * author and where it stands are said once, to a screen reader, and shown on the card that rises.
     */
    private renderBook(row: HTMLElement, item: ShelfItem, scope: Component, spine: boolean, hooks: DragHooks | null = null): HTMLElement {
        const book = row.createDiv({
            cls: [c("shelf-book"), ...(spine ? [c("shelf-book--spine")] : []), ...(item.imageOnly ? [c("shelf-book--scanned")] : [])],
            // Known across a redraw, so a book that changes shelf is carried there (#743 FR-16).
            attr: { role: "listitem", [FLIP_KEY]: item.id },
        });
        const words = this.bookWords(item);
        const open = book.createEl("button", {
            cls: c("shelf-book-open"),
            attr: { type: "button", "aria-label": t("shelf_open_named", words.join(", ")) },
        });
        let face: HTMLElement;
        if (spine) face = drawSpine(open, item);
        else {
            face = drawCover(open, item);
            bookMarks(face, item);
            this.watchCover(face, item);
        }
        scope.registerDomEvent(open, "click", () => this.openItem(item, {}, face));

        const more = book.createEl("button", {
            cls: ["clickable-icon", c("shelf-more")],
            attr: { type: "button", "aria-label": t("shelf_book_menu") },
        });
        setIcon(more, "more-horizontal");
        // ⋯ is the book's menu (#821 FR-15): Details, and Move to shelf… — a right click opens the same.
        scope.registerDomEvent(more, "click", (event: MouseEvent) => {
            event.stopPropagation();
            this.openBookMenu(item, event.clientX || event.clientY ? event : more);
        });
        scope.registerDomEvent(book, "contextmenu", (event: MouseEvent) => {
            event.preventDefault();
            this.openBookMenu(item, event);
        });
        if (hooks && item.kind !== "path" && item.file) draggable(book, face, item, hooks, scope);
        const show = () => this.showTip(book, words);
        scope.registerDomEvent(book, "pointerenter", show);
        scope.registerDomEvent(book, "focusin", show);
        scope.registerDomEvent(book, "pointerleave", () => this.hideTip());
        scope.registerDomEvent(book, "focusout", () => this.hideTip());
        return book;
    }

    /** What a book says of itself: the title, who wrote it, where it stands for you. */
    private bookWords(item: ShelfItem): string[] {
        const byline = item.kind === "path" && item.chapters ? tCount(item.chapters, "shelf_path_notes", String(item.chapters)) : item.author;
        let stands: string;
        if (item.status === "finished") stands = t("shelf_status_finished");
        else if (item.status === "to-read") stands = t("shelf_status_to_read");
        else if (item.lastRead === 0) stands = t("shelf_not_started");
        else stands = [whereLabel(item), lastReadLabel(item.lastRead)].filter(Boolean).join(" · ");
        return [item.title, byline ?? "", stands, item.imageOnly ? t("shelf_scanned") : ""].filter(Boolean);
    }

    /** The card that rises over the book you point at or reach by Tab (#820 FR-16). */
    private showTip(book: HTMLElement, words: string[]): void {
        const tip = this.tip;
        const host = this.shelfHost;
        if (!tip || !host) return;
        tip.empty();
        const [title, ...rest] = words;
        tip.createDiv({ cls: c("shelf-tip-title"), text: title });
        for (const line of rest) tip.createDiv({ cls: c("shelf-tip-line"), text: line });
        // Read once, written as two numbers a transform uses: nothing is laid out again.
        const at = book.getBoundingClientRect?.();
        const from = host.getBoundingClientRect?.();
        if (at && from) tip.setCssProps({ "--zf-tip-x": `${Math.round(at.left - from.left + at.width / 2)}px`, "--zf-tip-y": `${Math.round(at.top - from.top)}px` });
        tip.addClass(c("shelf-tip--shown"));
    }

    private hideTip(): void {
        this.tip?.removeClass(c("shelf-tip--shown"));
    }

    /** The shelf of the book you came back from turns to it, at once — never a slide (#820 AC-19). */
    private turnShelfTo(id: string): void {
        const book = [...(this.body?.querySelectorAll<HTMLElement>(`.${c("shelf-book")}`) ?? [])].find((el) => el.getAttribute(FLIP_KEY) === id);
        const row = book?.closest<HTMLElement>("[data-zf-scroll]");
        if (!book || !row) return;
        const left = book.offsetLeft;
        const right = left + book.offsetWidth;
        if (left < row.scrollLeft || right > row.scrollLeft + row.clientWidth) row.scrollLeft = Math.max(0, left - (row.clientWidth - book.offsetWidth) / 2);
        const status = row.getAttribute("data-zf-scroll");
        if (status) this.shelfLeft.set(status, row.scrollLeft);
    }

    private renderEmpty(body: HTMLElement, scope: Component): void {
        const empty = body.createDiv({ cls: c("shelf-empty") });
        setIcon(empty.createDiv({ cls: c("shelf-empty-icon") }), "library");
        empty.createEl("h2", { cls: c("shelf-empty-title"), text: t("shelf_empty_title") });
        empty.createDiv({ cls: c("shelf-empty-body"), text: t("shelf_empty_body") });
        // Clipping into another folder? Where articles come from is changed from here too (#744 FR-2).
        this.renderArticlesFrom(empty, scope);
        const note = this.lastNote();
        if (!note) return;
        const read = empty.createEl("button", { cls: "mod-cta", attr: { type: "button" }, text: t("shelf_empty_read") });
        scope.registerDomEvent(read, "click", () => readFrom(this.app, note));
    }

    /** The note you were in before the Library — where *Read a path across your notes* starts. */
    private lastNote(): string | null {
        const file = this.app.workspace.getActiveFile?.() ?? null;
        if (file?.extension === "md") return file.path;
        const recent = this.app.workspace.getLastOpenFiles?.() ?? [];
        return recent.find((path) => path.toLowerCase().endsWith(".md")) ?? null;
    }

    /**
     * A book open on the desk (#820): a small cover, the title and who wrote it, where you are and
     * when, a thread for how far — never a number — and *Resume reading*.
     */
    private renderDeskCard(parent: HTMLElement, item: ShelfItem, scope: Component): void {
        const card = parent.createDiv({ cls: c("shelf-desk-card"), attr: { [FLIP_KEY]: item.id } });
        // Back from the Reader, the book you are reading breathes once (#724).
        if (this.welcomeBack) card.addClass(c("shelf-desk-card--back"));
        this.welcomeBack = false;
        const cover = drawCover(card, item, "desk");
        if (item.kind === "paper") bookMarks(cover, item, true);
        this.watchCover(cover, item);
        const info = card.createDiv({ cls: c("shelf-desk-info") });
        info.createDiv({ cls: c("shelf-desk-title"), text: item.title });
        const byline = item.kind === "path" && item.chapters ? tCount(item.chapters, "shelf_path_notes", String(item.chapters)) : item.author;
        if (byline) info.createDiv({ cls: c("shelf-desk-author"), text: byline });
        const where = [whereLabel(item), lastReadLabel(item.lastRead)].filter(Boolean).join(" · ");
        info.createDiv({ cls: c("shelf-desk-where"), text: where });
        const bar = info.createDiv({ cls: c("shelf-progress"), attr: { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(item.progress * 100)) } });
        bar.createDiv({ cls: c("shelf-progress-fill") }).setCssProps({ "--zf-shelf-progress": String(item.progress) });
        const actions = info.createDiv({ cls: c("shelf-desk-actions") });
        const resume = actions.createEl("button", { cls: ["mod-cta", c("shelf-resume")], attr: { type: "button" } });
        setIcon(resume.createSpan({ cls: c("shelf-resume-icon") }), "book-open");
        resume.createSpan({ text: t("shelf_resume") });
        scope.registerDomEvent(resume, "click", () => this.openItem(item, {}, cover));
        scope.registerDomEvent(cover, "click", () => this.openItem(item, {}, cover));
        const more = actions.createEl("button", { cls: ["clickable-icon", c("shelf-desk-more")], attr: { type: "button", "aria-label": t("shelf_details") } });
        setIcon(more, "more-horizontal");
        scope.registerDomEvent(more, "click", (event: MouseEvent) => this.openBookMenu(item, event.clientX || event.clientY ? event : more));
    }

    /** Progress, highlights and notes born: what came of it, in one line — the detail's. */
    private renderFacts(parent: HTMLElement, item: ShelfItem): void {
        const facts = parent.createDiv({ cls: c("shelf-meta") });
        progressRing(facts, item.progress);
        facts.createSpan({ cls: c("shelf-meta-strong"), text: t("shelf_percent", String(Math.round(item.progress * 100))) });
        if (item.highlights > 0) {
            const marks = facts.createSpan({
                cls: c("shelf-meta-marks"),
                attr: { "aria-label": tCount(item.highlights, "shelf_highlights", String(item.highlights)) },
            });
            setIcon(marks.createSpan({ cls: c("shelf-meta-icon") }), "highlighter");
            marks.createSpan({ cls: c("shelf-meta-strong"), text: String(item.highlights) });
        }
        if (item.born > 0) facts.createSpan({ cls: c("shelf-born"), text: tCount(item.born, "shelf_born", String(item.born)) });
    }

    private scannedBadge(parent: HTMLElement): void {
        parent.createSpan({
            cls: c("shelf-scanned"),
            text: t("shelf_scanned"),
            attr: { "aria-label": t("shelf_scanned_hint"), title: t("shelf_scanned_hint") },
        });
    }

    // ── covers ───────────────────────────────────────────────────────────────

    /** A cover is read the first time it scrolls into view; one already read is laid on at once. */
    private watchCover(cover: HTMLElement, item: ShelfItem): void {
        // An article has no cover to read: its drawn one, in a theme colour, is its cover (#744 FR-3).
        if (!item.file || item.kind === "article") return;
        const file = this.app.vault.getAbstractFileByPath(item.file);
        if (!(file instanceof TFile)) return;
        const known = cachedCover(file);
        if (known) {
            if (known.url) showCoverImage(cover, known.url);
            return;
        }
        if (!this.observer) return;
        this.pendingCovers.set(cover, item);
        this.observer.observe(cover);
    }

    private onCoversVisible(entries: IntersectionObserverEntry[]): void {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const cover = entry.target as HTMLElement;
            const item = this.pendingCovers.get(cover);
            this.observer?.unobserve(cover);
            this.pendingCovers.delete(cover);
            if (item) void this.loadCover(cover, item);
        }
    }

    private async loadCover(cover: HTMLElement, item: ShelfItem): Promise<void> {
        const file = item.file ? this.app.vault.getAbstractFileByPath(item.file) : null;
        const format = item.file ? sourceFormat(item.file) : null;
        if (!(file instanceof TFile) || !format) return;
        const read = await readCover(this.app, file, format);
        if (read.url && cover.isConnected !== false) showCoverImage(cover, read.url);
        const meta = normalizeLibrary(this.plugin?.settings?.library)[file.path];
        if (read.facts.chapters > 0 && !isFresh(meta, file.stat.size, file.stat.mtime)) {
            // What the file declares — its title, its length, a scan — is on the shelf from now on.
            this.updateMeta((map) => withFacts(map, file.path, read.facts, file.stat.size, file.stat.mtime));
            this.scheduleRefresh();
        }
    }

    /** Change what plugin data remembers, and save it once things are quiet. */
    private updateMeta(change: (map: LibraryMeta) => LibraryMeta): void {
        const settings = this.plugin?.settings;
        if (!settings) return;
        settings.library = change(normalizeLibrary(settings.library));
        window.clearTimeout(this.saveTimer);
        this.saveTimer = window.setTimeout(() => {
            this.saveTimer = undefined;
            void this.plugin?.saveSettings?.()?.catch?.((error: unknown) => log.error(`[Library] could not save: ${String(error)}`));
        }, SAVE_MS);
    }

    // ── open, and the detail ─────────────────────────────────────────────────

    private openItem(item: ShelfItem, at: OpenAt = {}, from: HTMLElement | null = null): void {
        // Want to read, then opened (#822): Reading, written once — only from the Library's own doors.
        void this.settleStatusOnOpen(item);
        // One continuous shot (#734): the camera moves into the cover you clicked while the Reader opens.
        if (from && readingMotion(this.plugin?.settings?.readingMotion).open === "shot") beginOpenShot(this.containerEl, from);
        // Read in this leaf (#733): the shelf, as it is now, is where the Reader comes back to.
        const back = { filter: this.filter, sort: this.sort, ...(this.status !== "all" ? { status: this.status } : {}), ...(this.collection ? { shelf: this.collection } : {}), scroll: this.contentEl.scrollTop, focus: item.id };
        if (!openShelfItem(this.app, item, this.plugin ?? null, at, { leaf: this.leaf, back })) this.openDetail(item.id);
    }

    /** Opening a book you wanted to read moves it to Reading: one recorded write, its Undo under the bar. */
    private async settleStatusOnOpen(item: ShelfItem): Promise<void> {
        const change = statusOnOpen(item.details, Boolean(item.collections?.length));
        if (!change || item.kind === "path") return;
        await this.writeShelves([{ kind: "move", item, change }], t("shelf_moved", t("shelf_status_reading")), normalizeShelfNames(this.plugin?.settings?.libraryShelves), () => undefined);
    }

    private openDetail(id: string): void {
        const aside = this.aside;
        const item = this.shelf.items.find((candidate) => candidate.id === id);
        if (!aside || !item) {
            this.detail = null;
            return;
        }
        this.detail = id;
        const focus = this.openField && this.openField.detail === id && this.openField.until > Date.now() ? this.openField.field : null;
        if (!focus) this.openField = null;
        this.citePanel?.close(false);
        this.detailScope?.unload();
        const scope = new Component();
        scope.load();
        this.detailScope = scope;
        aside.empty();
        renderDetail(aside, item, {
            app: this.app,
            scope,
            cover: (parent) => {
                const cover = drawCover(parent, item, "detail");
                this.watchCover(cover, item);
                return cover;
            },
            facts: (parent) => this.renderFacts(parent, item),
            scanned: (parent) => this.scannedBadge(parent),
            lastRead: lastReadLabel(item.lastRead),
            open: (at) => this.openItem(item, at),
            close: () => this.closeDetail(),
            notebook: item.file ? () => this.openNotebook(item.file!) : undefined,
            cite: item.file && item.kind !== "path" ? (from) => this.citeBook(item, from) : undefined,
            produced: (parent, settled) =>
                renderProduced(parent, {
                    settled,
                    app: this.app,
                    scope,
                    item,
                    gather: () => gatherProduced(this.app, item, { articles: () => gatherArticles(this.app, articlesFolderOf(this.plugin)), ...this.deps.produced }),
                    open: (at) => this.openItem(item, at),
                    seen: PRODUCED_SEEN.has(item.id),
                    shown: () => PRODUCED_SEEN.add(item.id),
                }),
            details: (parent) =>
                renderDetails(parent, {
                    app: this.app,
                    scope,
                    item,
                    folder: () => this.plugin?.settings?.bookNotesFolder || "Library",
                    // Your shelves, the empty ones too (#821): a book is put on one from Details as well.
                    collections: () => this.ownNames(),
                    declared: async () => {
                        const file = item.file ? this.app.vault.getAbstractFileByPath(item.file) : null;
                        return file instanceof TFile ? declaredMetadata(this.app, file) : {};
                    },
                    saved: (details, note) => this.noteSaved(item.id, details, note),
                    ...(focus ? { focus } : {}),
                    ...this.deps.details,
                }),
        });
        this.holdPane();
        aside.addClass(c("shelf-detail--open"));
        this.scrim?.addClass(c("shelf-scrim--on"));
        this.app.workspace.requestSaveLayout();
    }

    /**
     * The detail and its dim cover the pane you see, whatever the shelf's scroll (#779): they sit over
     * the shelf's scroller — its scrollbar too — placed on its box by custom properties, never inline.
     * The shelf is never scrolled, so closing the detail leaves it exactly where it was.
     */
    private holdPane(): void {
        const pane = this.contentEl;
        const height = Math.round(pane.offsetHeight || 0);
        // No height to read (a pane not laid out yet): the stylesheet's own 100% stands.
        const band: Record<string, string> = { "--zf-pane-top": `${Math.round(pane.offsetTop || 0)}px`, ...(height > 0 ? { "--zf-pane-h": `${height}px` } : {}) };
        for (const layer of [this.scrim, this.aside]) layer?.setCssProps(band);
    }

    /** A pane resized with the detail open — a narrower split, an iPad turned: the band follows. */
    onResize(): void {
        if (this.aside?.hasClass(c("shelf-detail--open"))) this.holdPane();
    }

    /**
     * A book's note was written from its detail (#743): the shelf shows it at once — before the
     * metadata cache has caught up — and a card that changes row is carried there by a translate.
     */
    private noteSaved(id: string, details: BookDetails, note: string | null): void {
        if (this.updateItem(id, details, note) && this.body) flipMove(this.body, () => this.render());
    }

    /** What a book's note now says, on the shelf at once. Whether the shelf has it. */
    private updateItem(id: string, details: BookDetails, note: string | null): boolean {
        const at = this.shelf.items.findIndex((candidate) => candidate.id === id);
        const item = this.shelf.items[at];
        if (!item?.file) return false;
        const meta = this.shelf.meta[item.file];
        if (item.kind === "article") {
            // Its own frontmatter is its note (#744 FR-4): only the status and the collections changed.
            const next: ShelfItem = { ...item, details };
            delete next.status;
            delete next.collections;
            const status = effectiveStatus(details, meta);
            if (status) next.status = status;
            if (details.collections) next.collections = [...details.collections];
            this.shelf.items[at] = next;
            return true;
        }
        const status = effectiveStatus(note ? details : undefined, meta);
        const author = (note ? details.author?.join(", ") : undefined) ?? meta?.author;
        const next: ShelfItem = {
            ...item,
            title: (note ? details.title : undefined) ?? meta?.title ?? titleFromName(item.file.split("/").pop() ?? item.file),
        };
        for (const key of ["author", "status", "note", "details", "collections", "series"] as const) delete next[key];
        if (author) next.author = author;
        if (status) next.status = status;
        if (note) {
            next.note = note;
            next.details = details;
            if (details.collections) next.collections = [...details.collections];
            if (details.series) next.series = details.series;
            this.shelf.notes.set(item.file, { path: note, source: item.file, details });
        } else {
            this.shelf.notes.delete(item.file);
        }
        this.shelf.items[at] = next;
        return true;
    }

    // ── the notebook (#721) ──────────────────────────────────────────────────

    private openNotebook(path: string): void {
        this.closeDetail();
        this.notebook = path;
        this.notebookFilter = { meaning: null, withNotes: false };
        this.refresh();
        this.app.workspace.requestSaveLayout();
    }

    private closeNotebook(): void {
        this.notebook = null;
        this.notebookScope?.unload();
        this.notebookScope = null;
        this.refresh();
        this.app.workspace.requestSaveLayout();
    }

    /** The notebook of the source in `this.notebook`, drawn where the shelf was. False when it is gone. */
    private renderNotebookPage(): boolean {
        const body = this.body;
        const item = this.shelf.items.find((candidate) => candidate.file === this.notebook);
        if (!body || !item || !item.file) return false;
        this.notebookScope?.unload();
        const scope = new Component();
        scope.load();
        this.notebookScope = scope;
        const path = item.file;
        renderNotebook(body, item, {
            app: this.app,
            scope,
            load: () => (this.deps.store ?? ThoughtStore.getInstance()).highlightsAbout(path),
            filter: this.notebookFilter,
            setFilter: (next) => {
                this.notebookFilter = next;
                this.renderNotebookPage();
            },
            back: () => this.closeNotebook(),
            open: (at) => this.openItem(item, at ?? {}),
            toNote: (thought) => crystallizeHighlight(this.app, thought),
            drawing: (thought) => ThoughtStore.getInstance().drawingOf(thought),
            folder: this.plugin?.settings?.readingNoteFolder ?? "",
            rememberFolder: (folder) => {
                if (!this.plugin?.settings) return;
                this.plugin.settings.readingNoteFolder = folder;
                void this.plugin.saveSettings?.();
            },
        });
        return true;
    }

    /**
     * *Cite this book* (#768 FR-1): the whole source, no passage, from what its note (or the article's
     * frontmatter) says now. *Add it* puts the cursor in that field of the Details just below.
     */
    private citeBook(item: ShelfItem, from: HTMLElement): void {
        const file = item.file;
        if (!file) return;
        this.citePanel ??= new CitePanel({
            host: () => this.containerEl,
            form: () => citeFormOf(this.plugin?.settings?.citeForm),
            saveForm: (form) => {
                const settings = this.plugin?.settings;
                if (!settings || settings.citeForm === form) return;
                settings.citeForm = form;
                void this.plugin?.saveSettings?.()?.catch?.((error: unknown) => log.error(`[Library] could not save: ${String(error)}`));
            },
            addIt: (_file, field) => {
                const input = this.aside?.querySelector<HTMLInputElement>(`#zf-book-${field}`);
                // A field folded away (#822) is brought out first.
                input?.closest(`.${c("shelf-details-row")}`)?.removeClass(c("shelf-details-row--folded"));
                input?.scrollIntoView?.({ block: "center" });
                input?.focus();
            },
        });
        const format = item.kind === "article" ? "article" : item.format === "epub" ? "epub" : "pdf";
        const r = from.getBoundingClientRect();
        const panel = this.citePanel.show({ source: citeSourceOf(this.app, file, format, item.title), file, from: { left: r.left, top: r.top, width: r.width, height: r.height } });
        panel?.addClass(c("reader-cite--library"));
    }

    private closeDetail(): void {
        this.citePanel?.close();
        this.openField = null;
        this.detail = null;
        this.aside?.removeClass(c("shelf-detail--open"));
        this.scrim?.removeClass(c("shelf-scrim--on"));
        this.detailScope?.unload();
        this.detailScope = null;
        this.app.workspace.requestSaveLayout();
    }
}

export { LIBRARY_VIEW };
