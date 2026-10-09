import { Component, ItemView, Scope, TFile, moment as obsidianMoment, setIcon, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import type MomentFn from "moment";
import { c, log } from "architecture";
import { t, tCount } from "architecture/lang";
import {
    SHELF_FILTERS,
    SHELF_SORTS,
    continueReading,
    shelfCounts,
    viewShelf,
    type ShelfFilter,
    type ShelfItem,
    type ShelfSort,
} from "application/library/shelf";
import { isFresh, normalizeLibrary, renameSource, sourceFormat, withFacts, type LibraryMeta } from "application/library/sourceMeta";
import { readFrom } from "architecture/components/core/reader/readingChooser";
import { cachedCover, readCover } from "./libraryCovers";
import { drawCover, progressRing, showCoverImage } from "./libraryCoverEl";
import { renderDetail } from "./libraryDetail";
import { beginOpenShot } from "architecture/components/core/reader/readerShot";
import { readingMotion } from "architecture/components/core/reader/readingMotion";
import { renderNotebook, type NotebookFilter } from "./libraryNotebook";
import { crystallizeHighlight } from "./crystallizeHighlight";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { LIBRARY_VIEW, type LibraryHost } from "./libraryHost";
import { openShelfItem, type OpenAt } from "./libraryOpen";
import { gatherShelf, type Shelf } from "./libraryShelf";

type LocaleKey = Parameters<typeof t>[0];

/** Literal maps, so the locale guardrail sees every key the shelf draws. */
const FILTER_KEY: Record<ShelfFilter, LocaleKey> = {
    all: "shelf_filter_all",
    books: "shelf_filter_books",
    papers: "shelf_filter_papers",
    paths: "shelf_filter_paths",
};
const SECTION_KEY: Record<ShelfFilter, LocaleKey> = {
    all: "shelf_shelf",
    books: "shelf_filter_books",
    papers: "shelf_filter_papers",
    paths: "shelf_section_paths",
};
const SORT_KEY: Record<ShelfSort, LocaleKey> = {
    recent: "shelf_sort_recent",
    highlighted: "shelf_sort_highlighted",
    title: "shelf_sort_title",
};
const KIND_KEY: Record<ShelfItem["format"], LocaleKey> = {
    pdf: "shelf_kind_pdf",
    epub: "shelf_kind_epub",
    path: "shelf_kind_path",
};

// Obsidian re-exports its moment typed as a namespace; the callable signature is type-only.
const moment = obsidianMoment as unknown as typeof MomentFn;

/** Saving what was read off the files waits for a quiet moment, so a shelf of covers saves once. */
const SAVE_MS = 800;

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
    private detail: string | null = null;
    /** The source whose notebook is open instead of the shelf (#721). */
    private notebook: string | null = null;
    /** The Library came back into view: the continue card breathes once (#724). */
    private welcomeBack = false;
    /** Back from the Reader (#733): the scroll to land on once the shelf is drawn. One-shot. */
    private pendingScroll: number | null = null;
    private notebookFilter: NotebookFilter = { meaning: null, withNotes: false };
    private notebookScope: Component | null = null;
    private shelf: Shelf = { items: [], born: new Map(), meta: {} };
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
        /** Seams for tests: the thought store the notebook reads. */
        private readonly deps: { store?: Pick<ThoughtStore, "highlightsAbout"> } = {}
    ) {
        super(leaf);
        this.scope = new Scope(this.app?.scope);
        // Esc closes the detail, then the notebook; with neither open it is Obsidian's.
        this.scope.register([], "Escape", () => {
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
            ...(this.detail ? { detail: this.detail } : {}),
            ...(this.notebook ? { notebook: this.notebook } : {}),
        };
    }

    async setState(state: unknown, result: ViewStateResult): Promise<void> {
        await super.setState(state, result);
        const value = (state ?? {}) as Record<string, unknown>;
        if (typeof value.filter === "string" && (SHELF_FILTERS as readonly string[]).includes(value.filter)) this.filter = value.filter as ShelfFilter;
        if (typeof value.sort === "string" && (SHELF_SORTS as readonly string[]).includes(value.sort)) this.sort = value.sort as ShelfSort;
        this.detail = typeof value.detail === "string" && value.detail ? value.detail : null;
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
        this.scrim = this.contentEl.createDiv({ cls: c("shelf-scrim") });
        this.registerDomEvent(this.scrim, "click", () => this.closeDetail());
        this.aside = this.contentEl.createEl("aside", {
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
        // A source added, renamed or removed is on the shelf the moment the vault says so.
        const onVault = (file: unknown) => {
            if (file instanceof TFile && sourceFormat(file.path)) this.scheduleRefresh();
        };
        this.registerEvent(this.app.vault.on("create", onVault));
        this.registerEvent(this.app.vault.on("delete", onVault));
        this.registerEvent(
            this.app.vault.on("rename", (file, oldPath) => {
                if (!(file instanceof TFile) || !sourceFormat(file.path)) return;
                this.updateMeta((map) => renameSource(map, oldPath, file.path));
                this.scheduleRefresh();
            })
        );
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
        this.contentEl.empty();
        this.root = null;
    }

    /** Read the shelf again and draw it. */
    refresh(): void {
        if (!this.body) return;
        this.shelf = gatherShelf(this.app, this.plugin ?? null);
        if (this.notebook && this.renderNotebookPage()) return;
        this.notebook = null;
        this.render();
        if (this.detail) this.openDetail(this.detail);
        if (this.pendingScroll !== null) {
            this.contentEl.scrollTop = this.pendingScroll;
            this.pendingScroll = null;
        }
    }

    private scheduleRefresh(): void {
        window.clearTimeout(this.refreshTimer);
        this.refreshTimer = window.setTimeout(() => this.refresh(), 150);
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

    /** *Continue reading* and the shelf itself — what the search and the sort redraw. */
    private renderShelf(host: HTMLElement, scope: Component): void {
        host.empty();
        this.observer?.disconnect();
        const items = this.shelf.items;
        if (this.filter === "all" && !this.search.trim()) {
            const going = continueReading(items);
            if (going.length > 0) {
                host.createEl("h3", { cls: c("shelf-section"), text: t("shelf_continue") });
                const hero = host.createDiv({ cls: c("shelf-hero") });
                for (const item of going) this.renderHeroCard(hero, item, scope);
            }
        }
        host.createEl("h3", { cls: c("shelf-section"), text: t(SECTION_KEY[this.filter]) });
        const shown = viewShelf(items, { filter: this.filter, sort: this.sort, search: this.search });
        if (shown.length === 0) {
            host.createDiv({ cls: c("shelf-no-match"), text: t("shelf_no_match", this.search.trim()) });
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

    private renderCard(grid: HTMLElement, item: ShelfItem, scope: Component): void {
        const card = grid.createDiv({
            cls: [c("shelf-card"), ...(item.imageOnly ? [c("shelf-card--scanned")] : [])],
            attr: { role: "listitem" },
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
        last.createSpan({ text: lastReadLabel(item.lastRead) });
        if (item.imageOnly) this.scannedBadge(last);
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
        if (!item.file) return;
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
        this.detailScope?.unload();
        const scope = new Component();
        scope.load();
        this.detailScope = scope;
        aside.empty();
        renderDetail(aside, item, {
            app: this.app,
            scope,
            born: this.shelf.born.get(item.file ?? "") ?? [],
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
        });
        aside.addClass(c("shelf-detail--open"));
        this.scrim?.addClass(c("shelf-scrim--on"));
        this.app.workspace.requestSaveLayout();
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

    private closeDetail(): void {
        this.detail = null;
        this.aside?.removeClass(c("shelf-detail--open"));
        this.scrim?.removeClass(c("shelf-scrim--on"));
        this.detailScope?.unload();
        this.detailScope = null;
        this.app.workspace.requestSaveLayout();
    }
}

export { LIBRARY_VIEW };
