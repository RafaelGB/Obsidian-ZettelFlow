import { Component, ItemView, Keymap, MarkdownRenderer, TFile, setIcon, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import { buildEvidenceMap, type ChapterRole, type ReadingPath } from "architecture/knowledge/state";
import { READER_VIEW, parseReaderState, type ReaderKind } from "./readerContract";
import { pathFor } from "./readerPaths";
import { stripFrontmatter } from "./readerDocument";
import { KIND_KEY } from "./readerLabels";
import { renderEndCard, type EndCard } from "./readerEnd";
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
    } | null = null;
    /** Highlights and margin notes (#671): drawn over each chapter, kept as thoughts in Think. */
    private highlights: ReaderHighlights | null = null;
    /** A highlight a deep link asked to land on — consumed by the next chapter that holds it. */
    private pendingHighlight: string | null = null;
    /** The listeners and renders of the chapter on screen; replaced with it. */
    private chapter: Component | null = null;
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

    constructor(
        leaf: WorkspaceLeaf,
        private readonly plugin?: ReaderHost,
        /** Seams for tests: the thought store, the selection, the mark factory. */
        private readonly highlightDeps: HighlightDeps = {}
    ) {
        super(leaf);
        this.prefs = normalizeReaderPrefs(plugin?.settings?.readerPrefs);
    }

    /** A literal: `ItemView` calls this from its own constructor, before any field exists (#278). */
    getViewType(): string {
        return "zettelflow-reader";
    }

    getDisplayText(): string {
        return this.path ? `${t("reader_title")} · ${noteName(this.path.seed)}` : t("reader_title");
    }

    getIcon(): string {
        return "book-open";
    }

    getState(): Record<string, unknown> {
        const base = super.getState();
        const sides = heldSides();
        return {
            ...base,
            ...(this.path ? { seed: this.path.seed, chapter: this.index } : {}),
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
        if (parsed.seed) {
            // A new reading: its own clock, counts and end.
            if (parsed.seed !== this.path?.seed || (parsed.kind ?? "around") !== this.kind) {
                this.startedAt = Date.now();
                this.detourCount = 0;
                this.visited.clear();
                this.savedId = undefined;
                this.endStatus = undefined;
            }
            this.ended = false;
            this.name = parsed.name;
            this.kind = parsed.kind ?? "around";
            this.paths = parsed.kind === "selection" ? parsed.paths : undefined;
            this.path = pathFor(this.app, parsed.seed, this.kind, this.paths);
            this.index = Math.min(parsed.chapter ?? 0, this.path.chapters.length - 1);
        }
        if (this.els) this.render();
    }

    async onOpen(): Promise<void> {
        this.buildShell();
        this.contentEl.setAttribute("tabindex", "-1");
        this.registerDomEvent(this.contentEl, "keydown", (event) => this.onKey(event));
        this.registerDomEvent(this.contentEl, "mousemove", () => this.wake());
        this.render();
        this.contentEl.focus({ preventScroll: true });
    }

    async onClose(): Promise<void> {
        window.clearTimeout(this.idleTimer);
        this.highlights?.hidePopover();
        this.chapter?.unload();
        this.chapter = null;
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
        this.registerDomEvent(close, "click", () => exitReader(this.app, this.leaf));

        // The way back from a detour (#670): one press pops one level.
        const pill = root.createEl("button", {
            cls: [c("reader-detour-pill"), c("reader-hidden")].join(" "),
            attr: { type: "button" },
        });
        this.registerDomEvent(pill, "click", () => this.backFromDetour());
        this.pill = pill;

        const stage = root.createDiv({ cls: c("reader-stage") });
        // A peek is read in place; clicking elsewhere puts it away.
        this.registerDomEvent(root, "mousedown", (event) => {
            const target = event.target as HTMLElement | null;
            if (this.peek && target && !this.peek.contains(target) && !target.closest?.("a.internal-link")) this.closePeek();
        });
        const page = stage.createEl("article", { cls: c("reader-page") });
        // Kindle's margin (#671): the chapter's highlights and notes, beside the page on a wide pane.
        const margin = stage.createEl("aside", { cls: c("reader-margin"), attr: { "aria-label": t("reader_hl_margin") } });
        const dots = root.createDiv({ cls: c("reader-dots"), attr: { role: "tablist", "aria-label": t("reader_contents") } });

        const bar = root.createDiv({ cls: c("reader-bar"), attr: { role: "toolbar", "aria-label": t("reader_title") } });
        this.iconButton(bar, "chevron-left", "reader_previous", () => this.go(-1));
        const label = bar.createSpan({ cls: c("reader-bar-label") });
        const progress = bar.createEl("progress", { cls: c("reader-progress") });
        this.iconButton(bar, "chevron-right", "reader_next", () => this.go(1));
        bar.createSpan({ cls: c("reader-bar-sep") });
        this.iconButton(bar, "list", "reader_contents", () => this.toggle("contents"));
        this.iconButton(bar, "type", "reader_type", () => this.toggle("type"));
        this.iconButton(bar, "git-fork", "reader_context", () => this.toggle("context"));
        this.iconButton(bar, "maximize", "reader_fullscreen", () => this.toggleFullscreen());

        const panel = root.createDiv({ cls: c("reader-panel") });
        this.els = { title, page, dots, label, progress, panel, stage, margin };
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
        this.root.className = [...plugin.map((name) => c(name)), ...obsidian].join(" ");
    }

    private savePrefs(next: ReaderPrefs): void {
        this.prefs = next;
        this.applyPrefs();
        if (this.plugin?.settings) {
            this.plugin.settings.readerPrefs = next;
            void this.plugin.saveSettings?.();
        }
        if (this.panel === "type") this.renderPanel();
    }

    // ── chapters ─────────────────────────────────────────────────────────────

    private render(): void {
        if (!this.els) return;
        const els = this.els;
        const path = this.path;
        els.title.setText(path ? (this.name ?? `${noteName(path.seed)} · ${t(KIND_KEY[this.kind])}`) : t("reader_title"));
        const total = path?.chapters.length ?? 0;
        els.label.setText(this.ended ? t("reader_finished") : total ? t("reader_chapter_label", String(this.index + 1), String(total)) : "");
        els.progress.max = Math.max(1, total);
        els.progress.value = this.ended ? total : total ? this.index + 1 : 0;

        els.dots.empty();
        path?.chapters.forEach((chapter, i) => {
            const dot = els.dots.createEl("button", {
                cls: [c("reader-dot"), ...(i < this.index || this.ended ? [c("reader-dot--done")] : []), ...(i === this.index && !this.ended ? [c("reader-dot--current")] : [])].join(" "),
                attr: {
                    type: "button",
                    role: "tab",
                    "aria-selected": String(i === this.index),
                    "aria-label": t("reader_dot_label", String(i + 1), noteName(chapter.path)),
                },
            });
            this.registerDomEvent(dot, "click", () => this.show(i));
        });
        this.renderPill();
        if (this.ended) this.renderEnd();
        else void this.renderChapter();
        if (this.panel) this.renderPanel();
    }

    private async renderChapter(): Promise<void> {
        if (!this.els || !this.path) return;
        const generation = ++this.generation;
        const { page, stage } = this.els;
        const chapter = this.path.chapters[this.index];
        const detour = this.detours[this.detours.length - 1];
        const reading = detour ?? chapter.path;
        if (!detour) this.visited.add(chapter.path);
        this.peek = null;
        this.chapter?.unload();
        const component = new Component();
        component.load();
        this.chapter = component;

        page.empty();
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

        const file = this.app.vault.getAbstractFileByPath(reading);
        if (!(file instanceof TFile)) {
            body.createDiv({ cls: c("reader-missing"), text: t("reader_missing") });
        } else {
            try {
                const markdown = await this.app.vault.cachedRead(file);
                if (generation !== this.generation) return;
                await MarkdownRenderer.render(this.app, readableBody(markdown), body, file.path, component);
            } catch (error) {
                log.error(`[Reader] could not render ${reading}: ${error instanceof Error ? error.message : String(error)}`);
                body.createDiv({ cls: c("reader-missing"), text: t("reader_missing") });
            }
        }
        if (generation !== this.generation) return;
        component.registerDomEvent(body, "click", (event) => this.onLink(event));
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

        const next = page.createDiv({ cls: c("reader-next") }).createEl("button", {
            cls: c("reader-next-button"),
            attr: { type: "button" },
        });
        if (detour) {
            next.setText(t("reader_back_to", this.backName()));
            component.registerDomEvent(next, "click", () => this.backFromDetour());
            return;
        }
        const last = this.index === total - 1;
        next.setText(last ? t("reader_finish") : t("reader_next_named", noteName(this.path.chapters[this.index + 1].path)));
        component.registerDomEvent(next, "click", () => (last ? this.finish() : this.go(1)));
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
        const on = this.detours.length > 0;
        this.pill.toggleClass(c("reader-hidden"), !on);
        this.pill.setText(on ? `↩ ${t("reader_back_to", this.backName())}` : "");
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
        const found = this.linkTarget(event);
        if (!found) return;
        event.preventDefault();
        if (Keymap.isModEvent(event)) {
            if (found.file) void this.app.workspace.openLinkText(found.file.path, this.reading() ?? "", "tab");
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
        if (notePath) hoverPreview(this.app, title, notePath, this);
        const excerpt = card.createDiv({ cls: c("reader-peek-excerpt") });
        const actions = card.createDiv({ cls: c("reader-peek-actions") });
        const action = (key: LocaleKey, primary: boolean, run: () => void) => {
            const button = actions.createEl("button", {
                cls: [c("reader-peek-action"), ...(primary ? ["mod-cta"] : [])].join(" "),
                attr: { type: "button" },
                text: t(key),
            });
            this.registerDomEvent(button, "click", run);
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
        this.detours = [];
        this.ended = false;
        this.index = Math.max(0, Math.min(index, this.path.chapters.length - 1));
        this.render();
        this.app.workspace.requestSaveLayout();
        this.rememberPlace();
    }

    private go(delta: number): void {
        if (!this.path) return;
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

    // ── panels ───────────────────────────────────────────────────────────────

    private toggle(panel: Exclude<Panel, null>): void {
        this.panel = this.panel === panel ? null : panel;
        this.renderPanel();
    }

    private renderPanel(): void {
        if (!this.els) return;
        const host = this.els.panel;
        host.empty();
        host.toggleClass(c("reader-panel--open"), this.panel !== null);
        if (this.panel === "contents") this.renderContents(host);
        else if (this.panel === "type") this.renderType(host);
        else if (this.panel === "context") this.renderContext(host);
    }

    private renderContents(host: HTMLElement): void {
        host.createDiv({ cls: c("reader-panel-title"), text: t("reader_contents") });
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
            this.registerDomEvent(row, "click", () => this.show(i));
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
                this.registerDomEvent(button, "click", () => this.savePrefs(apply(option)));
            }
        };
        group(READER_FONTS, this.prefs.font, (o) => FONT_KEY[o], (font) => ({ ...this.prefs, font }));
        group(READER_SIZES, this.prefs.size, (o) => SIZE_KEY[o], (size) => ({ ...this.prefs, size }));
        group(READER_THEMES, this.prefs.theme, (o) => THEME_KEY[o], (theme) => ({ ...this.prefs, theme }));
    }

    private renderContext(host: HTMLElement): void {
        host.createDiv({ cls: c("reader-panel-title"), text: t("reader_context") });
        const index = KnowledgeIndex.getInstance();
        if (!this.path || index.status !== "ready") return;
        const map = buildEvidenceMap(index.getModel(), this.reading() ?? this.path.chapters[this.index].path);
        const list = (key: LocaleKey, paths: string[]) => {
            if (paths.length === 0) return;
            host.createDiv({ cls: c("reader-context-heading"), text: t(key) });
            for (const p of paths) {
                // Each is a peek too: read it here, take it as a detour, or add it to this reading.
                const row = host.createEl("button", { cls: c("reader-context-row"), attr: { type: "button" }, text: noteName(p) });
                this.registerDomEvent(row, "click", () => this.openPeek(row, p, noteName(p)));
                hoverPreview(this.app, row, p, this);
            }
        };
        // Your highlights here too: the margin only has room on a wide pane (#671).
        this.highlights?.renderList(host);
        list("reader_supports", map.supports);
        list("reader_argues", map.contradicts);
        list("reader_questions", map.gaps.openQuestions);
        if (map.supports.length + map.contradicts.length + map.gaps.openQuestions.length === 0) {
            host.createDiv({ cls: c("reader-context-empty"), text: t("reader_context_empty") });
        }
    }

    // ── keys, idle bar, fullscreen ───────────────────────────────────────────

    private onKey(event: KeyboardEvent): void {
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
        this.wake();
        switch (event.key) {
            case "ArrowRight":
            case "PageDown":
            case " ":
                event.preventDefault();
                this.go(1);
                return;
            case "ArrowLeft":
            case "PageUp":
                event.preventDefault();
                this.go(-1);
                return;
            case "Home":
                this.show(0);
                return;
            case "End":
                this.show((this.path?.chapters.length ?? 1) - 1);
                return;
            case "f":
            case "F":
                event.preventDefault();
                this.toggleFullscreen();
                return;
            case "h":
            case "H":
                // H keeps the selection as a highlight; Shift+H asks for a note with it (#671).
                if (this.highlights?.highlightCurrent(event.shiftKey)) event.preventDefault();
                return;
            case "Escape":
                // One thing at a time, nearest first: the highlight popover, the peek, a detour, a panel.
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
                // In fullscreen the browser takes Esc to leave it; only then does Esc leave the reader.
                if (this.ownDocument()?.fullscreenElement) return;
                exitReader(this.app, this.leaf);
                return;
        }
    }

    /** Bring an element of the chapter into view inside the reader's own scroller, never its ancestors. */
    private scrollToEl(el: HTMLElement): void {
        const stage = this.els?.stage;
        if (!stage) return;
        const top = el.getBoundingClientRect().top - stage.getBoundingClientRect().top + stage.scrollTop - stage.clientHeight / 3;
        stage.scrollTop = Math.max(0, top);
    }

    private ownDocument(): Document | undefined {
        return (this.contentEl as HTMLElement & { doc?: Document }).doc;
    }

    private toggleFullscreen(): void {
        const doc = this.ownDocument();
        try {
            if (doc?.fullscreenElement) void doc.exitFullscreen();
            else void this.contentEl.requestFullscreen?.();
        } catch (error) {
            log.debug(`[Reader] fullscreen unavailable: ${String(error)}`);
        }
    }

    /** Show the bar, then let it fade when nothing moves. */
    private wake(): void {
        if (!this.root) return;
        this.root.removeClass(c("reader--idle"));
        window.clearTimeout(this.idleTimer);
        this.idleTimer = window.setTimeout(() => {
            if (!this.panel) this.root?.addClass(c("reader--idle"));
        }, IDLE_MS);
    }
}

export { READER_VIEW };
