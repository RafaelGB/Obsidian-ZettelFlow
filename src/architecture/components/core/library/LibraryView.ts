import { Component, ItemView, Scope, Setting, TFile, moment as obsidianMoment, setIcon, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import type MomentFn from "moment";
import { c, log } from "architecture";
import { t, tCount } from "architecture/lang";
import {
    SHELF_FILTERS,
    SHELF_SORTS,
    STATUS_FILTERS,
    continueReading,
    fold,
    recentlyAdded,
    shelfCollections,
    shelfCounts,
    statusCounts,
    titleFromName,
    viewShelf,
    wantToRead,
    type ShelfFilter,
    type ShelfItem,
    type ShelfSort,
    type StatusFilter,
} from "application/library/shelf";
import { BOOK_LINK_KEY, TEXT_FIELDS, collectionsInUse, effectiveStatus, type BookDetails, type TextField } from "application/library/bookNote";
import { isFresh, normalizeLibrary, renameSource, sourceFormat, withFacts, type LibraryMeta } from "application/library/sourceMeta";
import { readFrom } from "architecture/components/core/reader/readingChooser";
import { cachedCover, readCover } from "./libraryCovers";
import { drawCover, progressRing, showCoverImage } from "./libraryCoverEl";
import { renderDetail } from "./libraryDetail";
import { renderDetails, STATUS_KEY, type DetailsParts } from "./libraryDetails";
import { arriveIn, dropIn, flipMove, FLIP_KEY } from "./libraryFlip";
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

type LocaleKey = Parameters<typeof t>[0];

/** Literal maps, so the locale guardrail sees every key the shelf draws. */
const FILTER_KEY: Record<ShelfFilter, LocaleKey> = {
    all: "shelf_filter_all",
    books: "shelf_filter_books",
    papers: "shelf_filter_papers",
    articles: "shelf_filter_articles",
    paths: "shelf_filter_paths",
};
const SECTION_KEY: Record<ShelfFilter, LocaleKey> = {
    all: "shelf_shelf",
    books: "shelf_filter_books",
    papers: "shelf_filter_papers",
    articles: "shelf_section_articles",
    paths: "shelf_section_paths",
};
const SORT_KEY: Record<ShelfSort, LocaleKey> = {
    recent: "shelf_sort_recent",
    highlighted: "shelf_sort_highlighted",
    title: "shelf_sort_title",
    added: "shelf_sort_added",
};
const KIND_KEY: Record<ShelfItem["format"], LocaleKey> = {
    pdf: "shelf_kind_pdf",
    epub: "shelf_kind_epub",
    article: "shelf_kind_article",
    path: "shelf_kind_path",
};

/** A card in *Recently added* is known by this across a redraw — apart from the same item's card on the shelf. */
const recentKey = (id: string) => `recent:${id}`;

// Obsidian re-exports its moment typed as a namespace; the callable signature is type-only.
const moment = obsidianMoment as unknown as typeof MomentFn;

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
    /** The collections the chip row last drew: a new one drops in (FR-16). */
    private drawnCollections: Set<string> | null = null;
    /** What *Recently added* last drew (#744 FR-13): a card new since then settles in. `null` before the first draw. */
    private drawnRecent: Set<string> | null = null;
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
            produced?: { store?: Pick<ThoughtStore, "thoughtsAbout">; index?: Pick<KnowledgeIndex, "status" | "getModel"> };
        } = {}
    ) {
        super(leaf);
        this.scope = new Scope(this.app?.scope);
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
            ...(this.collection ? { collection: this.collection } : {}),
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
        this.collection = typeof value.collection === "string" && value.collection ? value.collection : null;
        this.detail = typeof value.detail === "string" && value.detail ? value.detail : null;
        this.openField =
            this.detail && typeof value.field === "string" && (TEXT_FIELDS as readonly string[]).includes(value.field) ? { field: value.field as TextField, detail: this.detail, until: Date.now() + FIELD_HOLD_MS } : null;
        const notebook = typeof value.notebook === "string" && value.notebook ? value.notebook : null;
        if (notebook !== this.notebook) this.notebookFilter = { meaning: null, withNotes: false };
        this.notebook = notebook;
        if (typeof value.scroll === "number" && Number.isFinite(value.scroll) && value.scroll >= 0) this.pendingScroll = value.scroll;
        if (this.root) this.refresh();
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass(c("shelf-host"));
        this.root = this.contentEl.createDiv({ cls: c("shelf") });
        this.body = this.root.createDiv({ cls: c("shelf-body") });
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
        this.registerEvent(this.app.vault.on("create", onVault));
        this.registerEvent(this.app.vault.on("delete", onVault));
        this.registerEvent(
            this.app.vault.on("rename", (file, oldPath) => {
                if (!(file instanceof TFile)) return;
                // An article moved into, or out of, the articles folder comes, or goes (#744).
                if (this.inArticles(file.path) || this.inArticles(oldPath)) {
                    this.updateMeta((map) => renameSource(map, oldPath, file.path));
                    this.scheduleRefresh();
                    return;
                }
                if (!sourceFormat(file.path)) return;
                this.updateMeta((map) => renameSource(map, oldPath, file.path));
                this.scheduleRefresh();
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
        const known = this.drawnRecent;
        const arrived = known !== null && this.sectioned() && recentlyAdded(this.shelf.items, Date.now()).some((item) => !known.has(item.id));
        if (arrived) flipMove(this.body, () => this.render());
        else this.render();
        // The kept place first (#779): a detail opened from view state covers the pane you see there.
        if (this.pendingScroll !== null) {
            this.contentEl.scrollTop = this.pendingScroll;
            this.pendingScroll = null;
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
        body.empty();
        this.renderScope?.unload();
        const scope = new Component();
        scope.load();
        this.renderScope = scope;
        this.observer?.disconnect();

        const head = body.createDiv({ cls: c("shelf-head") });
        const titles = head.createDiv({ cls: c("shelf-titles") });
        titles.createEl("h1", { cls: c("shelf-heading"), text: t("shelf_title") });
        titles.createDiv({ cls: c("shelf-subtitle"), text: t("shelf_subtitle") });
        const items = this.shelf.items;
        if (items.length === 0) {
            this.renderEmpty(body, scope);
            return;
        }

        const search = head.createEl("label", { cls: c("shelf-search") });
        setIcon(search.createSpan({ cls: c("shelf-search-icon") }), "search");
        const input = search.createEl("input", {
            cls: c("shelf-search-input"),
            attr: { type: "search", placeholder: t("shelf_search"), "aria-label": t("shelf_search"), spellcheck: "false" },
        });
        input.value = this.search;
        scope.registerDomEvent(input, "input", () => {
            this.search = input.value;
            this.renderShelf(shelfHost, scope);
        });

        const bar = body.createDiv({ cls: c("shelf-bar") });
        const counts = shelfCounts(items);
        for (const filter of SHELF_FILTERS) {
            const chip = bar.createEl("button", {
                cls: [c("shelf-filter"), ...(filter === this.filter ? ["is-active"] : [])],
                attr: { type: "button", "aria-pressed": String(filter === this.filter) },
            });
            chip.createSpan({ text: t(FILTER_KEY[filter]) });
            chip.createSpan({ cls: c("shelf-filter-count"), text: String(counts[filter]) });
            scope.registerDomEvent(chip, "click", () => {
                this.filter = filter;
                this.app.workspace.requestSaveLayout();
                this.render();
            });
        }
        const sort = bar.createEl("select", { cls: ["dropdown", c("shelf-sort")], attr: { "aria-label": t("shelf_sort_label") } });
        if (this.filter === "articles") this.renderArticlesFrom(body, scope);
        this.renderNoteChips(body, scope);
        for (const option of SHELF_SORTS) sort.createEl("option", { text: t(SORT_KEY[option]), attr: { value: option } });
        sort.value = this.sort;
        scope.registerDomEvent(sort, "change", () => {
            this.sort = sort.value as ShelfSort;
            this.app.workspace.requestSaveLayout();
            this.renderShelf(shelfHost, scope);
        });

        const shelfHost = body.createDiv({ cls: c("shelf-shelf-host") });
        this.renderShelf(shelfHost, scope);
    }

    /**
     * The second row of chips (#743 FR-9): **All · Reading · Want to read · Finished**, each status
     * once something stands there, and **Every collection** with each collection in use.
     */
    private renderNoteChips(body: HTMLElement, scope: Component): void {
        const items = this.shelf.items;
        const row = body.createDiv({ cls: [c("shelf-bar"), c("shelf-bar--notes")] });
        const statuses = row.createDiv({ cls: c("shelf-chip-group"), attr: { role: "group", "aria-label": t("shelf_status_row") } });
        const counts = statusCounts(items);
        for (const status of STATUS_FILTERS) {
            if (status !== "all" && counts[status] === 0 && this.status !== status) continue;
            const on = status === this.status;
            const chip = statuses.createEl("button", {
                cls: [c("shelf-filter"), c("shelf-filter--status"), ...(on ? ["is-active"] : [])],
                attr: { type: "button", "aria-pressed": String(on) },
            });
            chip.createSpan({ text: t(status === "all" ? "shelf_filter_all" : STATUS_KEY[status]) });
            chip.createSpan({ cls: c("shelf-filter-count"), text: String(counts[status]) });
            scope.registerDomEvent(chip, "click", () => {
                this.status = status;
                this.app.workspace.requestSaveLayout();
                this.render();
            });
        }
        const names = shelfCollections(items);
        const chosen = this.collection;
        if (chosen && !names.some((name) => fold(name) === fold(chosen))) names.push(chosen);
        const groups = row.createDiv({ cls: c("shelf-chip-group"), attr: { role: "group", "aria-label": t("shelf_collection_row") } });
        const known = this.drawnCollections;
        for (const name of [null, ...names]) {
            const on = name === null ? chosen === null : fold(name) === fold(chosen ?? "");
            const chip = groups.createEl("button", {
                cls: [c("shelf-filter"), c("shelf-filter--collection"), ...(on ? ["is-active"] : [])],
                attr: { type: "button", "aria-pressed": String(on) },
                text: name ?? t("shelf_filter_collection_all"),
            });
            scope.registerDomEvent(chip, "click", () => {
                this.collection = name;
                this.app.workspace.requestSaveLayout();
                this.render();
            });
            // A collection you just gave a book drops into the row (FR-16); the first draw is still.
            if (name !== null && known && !known.has(fold(name))) dropIn(chip);
        }
        this.drawnCollections = new Set(names.map(fold));
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

    /** Nothing narrowed: the shelf reads in sections. */
    private sectioned(): boolean {
        return this.filter === "all" && this.status === "all" && !this.collection && !this.search.trim();
    }

    /** *Continue reading*, *Recently added*, *Want to read* and the shelf itself — what the search and the sort redraw. */
    private renderShelf(host: HTMLElement, scope: Component): void {
        host.empty();
        this.observer?.disconnect();
        const items = this.shelf.items;
        const sectioned = this.sectioned();
        if (sectioned) {
            const going = continueReading(items);
            if (going.length > 0) {
                host.createEl("h3", { cls: c("shelf-section"), text: t("shelf_continue") });
                const hero = host.createDiv({ cls: c("shelf-hero") });
                for (const item of going) this.renderHeroCard(hero, item, scope);
            }
            // What came into the vault lately (#744 FR-8): one row, hidden when there is nothing.
            const recent = recentlyAdded(items, Date.now());
            const known = this.drawnRecent;
            if (recent.length > 0) {
                host.createEl("h3", { cls: c("shelf-section"), text: t("shelf_recent") });
                const row = host.createDiv({ cls: [c("shelf-shelf"), c("shelf-shelf--recent")], attr: { role: "list" } });
                for (const item of recent) {
                    const card = this.renderCard(row, item, scope, recentKey(item.id));
                    // A card new since the last draw settles in; the first draw is still (FR-13).
                    if (known && !known.has(item.id)) arriveIn(card);
                }
            }
            this.drawnRecent = new Set(recent.map((item) => item.id));
        }
        // What you said you want to read, after what you are reading — only when it holds something (FR-9).
        const want = sectioned ? viewShelf(wantToRead(items), { filter: "all", sort: this.sort, search: "" }) : [];
        if (want.length > 0) {
            host.createEl("h3", { cls: c("shelf-section"), text: t("shelf_status_to_read") });
            const grid = host.createDiv({ cls: [c("shelf-shelf"), c("shelf-shelf--want")], attr: { role: "list" } });
            for (const item of want) this.renderCard(grid, item, scope);
        }
        host.createEl("h3", { cls: c("shelf-section"), text: t(SECTION_KEY[this.filter]) });
        const query = { filter: this.filter, sort: this.sort, search: this.search, status: this.status, collection: this.collection };
        const wanted = new Set(want.map((item) => item.id));
        const shown = viewShelf(items, query).filter((item) => !wanted.has(item.id));
        if (shown.length === 0) {
            // No articles yet: the line under the chip already says where they come from (#744).
            if (this.filter !== "articles" || this.search.trim()) host.createDiv({ cls: c("shelf-no-match"), text: t("shelf_no_match", this.search.trim()) });
            return;
        }
        const grid = host.createDiv({ cls: c("shelf-shelf"), attr: { role: "list" } });
        for (const item of shown) this.renderCard(grid, item, scope);
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

    private renderCard(grid: HTMLElement, item: ShelfItem, scope: Component, key = item.id): HTMLElement {
        const card = grid.createDiv({
            cls: [c("shelf-card"), ...(item.imageOnly ? [c("shelf-card--scanned")] : [])],
            // Known across a redraw, so a card that changes row is carried there (#743 FR-16).
            attr: { role: "listitem", [FLIP_KEY]: key },
        });
        const open = card.createEl("button", {
            cls: c("shelf-card-open"),
            attr: { type: "button", "aria-label": t("shelf_open_named", item.title) },
        });
        const cover = drawCover(open, item);
        open.createSpan({ cls: c("shelf-kind"), text: t(KIND_KEY[item.format]) });
        this.watchCover(cover, item);
        scope.registerDomEvent(open, "click", () => this.openItem(item, {}, cover));

        const more = card.createEl("button", {
            cls: ["clickable-icon", c("shelf-more")],
            attr: { type: "button", "aria-label": t("shelf_details") },
        });
        setIcon(more, "more-horizontal");
        scope.registerDomEvent(more, "click", (event: MouseEvent) => {
            event.stopPropagation();
            this.openDetail(item.id);
        });

        card.createDiv({ cls: c("shelf-card-title"), text: item.title });
        const byline = item.kind === "path" && item.chapters ? tCount(item.chapters, "shelf_path_notes", String(item.chapters)) : item.author;
        if (byline) card.createDiv({ cls: c("shelf-card-author"), text: byline });
        this.renderFacts(card, item);
        const last = card.createDiv({ cls: c("shelf-meta") });
        // Where it stands for you, where it said *Never opened* (#743 FR-9) — and *Reading* you set on
        // a book not opened yet, rather than a *Never opened* that contradicts it.
        if (item.status === "to-read" || item.status === "finished" || (item.status === "reading" && item.lastRead === 0)) {
            last.createSpan({ cls: c("shelf-card-status"), text: t(STATUS_KEY[item.status]) });
        } else {
            last.createSpan({ text: lastReadLabel(item.lastRead) });
        }
        if (item.imageOnly) this.scannedBadge(last);
        return card;
    }

    /** Progress, highlights and notes born: what came of it, in one line. */
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

    private renderHeroCard(parent: HTMLElement, item: ShelfItem, scope: Component): void {
        const card = parent.createDiv({ cls: c("shelf-hero-card") });
        // Back from the Reader, the book you are reading breathes once (#724).
        if (this.welcomeBack) card.addClass(c("shelf-hero-card--back"));
        this.welcomeBack = false;
        const cover = drawCover(card, item, "hero");
        this.watchCover(cover, item);
        const info = card.createDiv({ cls: c("shelf-hero-info") });
        const meta = info.createDiv({ cls: c("shelf-meta") });
        meta.createSpan({ cls: c("shelf-kind-inline"), text: t(KIND_KEY[item.format]) });
        meta.createSpan({ text: lastReadLabel(item.lastRead) });
        info.createDiv({ cls: c("shelf-hero-title"), text: item.title });
        if (item.author) info.createDiv({ cls: c("shelf-card-author"), text: item.author });
        const bar = info.createDiv({ cls: c("shelf-progress"), attr: { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(item.progress * 100)) } });
        bar.createDiv({ cls: c("shelf-progress-fill") }).setCssProps({ "--zf-shelf-progress": String(item.progress) });
        const where = whereLabel(item);
        if (where) info.createDiv({ cls: c("shelf-hero-where"), text: where });
        const resume = info.createEl("button", { cls: ["mod-cta", c("shelf-resume")], attr: { type: "button" } });
        setIcon(resume.createSpan({ cls: c("shelf-resume-icon") }), "book-open");
        resume.createSpan({ text: t("shelf_resume") });
        scope.registerDomEvent(resume, "click", () => this.openItem(item, {}, cover));
        scope.registerDomEvent(cover, "click", () => this.openItem(item, {}, cover));
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
        // One continuous shot (#734): the camera moves into the cover you clicked while the Reader opens.
        if (from && readingMotion(this.plugin?.settings?.readingMotion).open === "shot") beginOpenShot(this.containerEl, from);
        // Read in this leaf (#733): the shelf, as it is now, is where the Reader comes back to.
        const back = { filter: this.filter, sort: this.sort, scroll: this.contentEl.scrollTop, focus: item.id };
        if (!openShelfItem(this.app, item, this.plugin ?? null, at, { leaf: this.leaf, back })) this.openDetail(item.id);
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
            produced: (parent) =>
                renderProduced(parent, {
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
                    collections: () => collectionsInUse([...this.shelf.notes.values(), ...this.articleNotes()]),
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
        const at = this.shelf.items.findIndex((candidate) => candidate.id === id);
        const item = this.shelf.items[at];
        if (!item?.file) return;
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
            if (this.body) flipMove(this.body, () => this.render());
            return;
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
        if (!this.body) return;
        flipMove(this.body, () => this.render());
    }

    /** The articles' own frontmatter, as notes: their collections are suggested too (#744). */
    private articleNotes(): { details: BookDetails }[] {
        return this.shelf.items.filter((item) => item.kind === "article" && item.details).map((item) => ({ details: item.details! }));
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
