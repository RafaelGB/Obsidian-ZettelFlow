import { Component, ItemView, MarkdownRenderer, TFile, setIcon, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import { buildEvidenceMap, type ChapterRole, type ReadingPath } from "architecture/knowledge/state";
import { READER_VIEW, parseReaderState, type ReaderKind } from "./readerContract";
import { pathFor } from "./readerPaths";
import { normalizeResume, readingKey, recordResume } from "./readerResume";
import type { ReaderHost } from "./readerHost";
import { adoptHeldSides, exitReader, heldSides, restoreWorkspace } from "./openReader";
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

/** What each way through the notes is called, on the reader's title line and in the chooser. */
export const KIND_KEY: Record<ReaderKind, LocaleKey> = {
    around: "reader_kind_around",
    argument: "reader_kind_argument",
    story: "reader_kind_story",
    essentials: "reader_kind_essentials",
    region: "reader_kind_region",
    selection: "reader_kind_selection",
};

type Panel = "contents" | "type" | "context" | null;

/** A note's body without its frontmatter: the properties are not part of what you read. */
export function readableBody(markdown: string): string {
    return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

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
    } | null = null;
    /** The listeners and renders of the chapter on screen; replaced with it. */
    private chapter: Component | null = null;
    private idleTimer: number | undefined;
    /** Bumped on every chapter change, so a slow read never draws over a newer chapter. */
    private generation = 0;

    constructor(
        leaf: WorkspaceLeaf,
        private readonly plugin?: ReaderHost
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
            ...(sides ? { restore: sides } : {}),
        };
    }

    async setState(state: unknown, result: ViewStateResult): Promise<void> {
        await super.setState(state, result);
        const parsed = parseReaderState(state);
        if (parsed.restore) adoptHeldSides(parsed.restore);
        if (parsed.seed) {
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

        const stage = root.createDiv({ cls: c("reader-stage") });
        const page = stage.createEl("article", { cls: c("reader-page") });
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
        this.els = { title, page, dots, label, progress, panel, stage };
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
        els.title.setText(path ? `${noteName(path.seed)} · ${t(KIND_KEY[this.kind])}` : t("reader_title"));
        const total = path?.chapters.length ?? 0;
        els.label.setText(total ? t("reader_chapter_label", String(this.index + 1), String(total)) : "");
        els.progress.max = Math.max(1, total);
        els.progress.value = total ? this.index + 1 : 0;

        els.dots.empty();
        path?.chapters.forEach((chapter, i) => {
            const dot = els.dots.createEl("button", {
                cls: [c("reader-dot"), ...(i < this.index ? [c("reader-dot--done")] : []), ...(i === this.index ? [c("reader-dot--current")] : [])].join(" "),
                attr: {
                    type: "button",
                    role: "tab",
                    "aria-selected": String(i === this.index),
                    "aria-label": t("reader_dot_label", String(i + 1), noteName(chapter.path)),
                },
            });
            this.registerDomEvent(dot, "click", () => this.show(i));
        });
        void this.renderChapter();
        if (this.panel) this.renderPanel();
    }

    private async renderChapter(): Promise<void> {
        if (!this.els || !this.path) return;
        const generation = ++this.generation;
        const { page, stage } = this.els;
        const chapter = this.path.chapters[this.index];
        this.chapter?.unload();
        const component = new Component();
        component.load();
        this.chapter = component;

        page.empty();
        const total = this.path.chapters.length;
        page.createDiv({
            cls: c("reader-count"),
            text: `${String(this.index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
        });
        page.createDiv({ cls: c("reader-role") }).createSpan({
            cls: [c("reader-role-tag"), c(`reader-role-tag--${chapter.role}`)].join(" "),
            text: t(ROLE_KEY[chapter.role]),
        });
        page.createEl("h1", { cls: c("reader-chapter-title"), text: noteName(chapter.path) });
        const body = page.createDiv({ cls: ["markdown-rendered", c("reader-body")].join(" ") });
        stage.scrollTop = 0;

        const file = this.app.vault.getAbstractFileByPath(chapter.path);
        if (!(file instanceof TFile)) {
            body.createDiv({ cls: c("reader-missing"), text: t("reader_missing") });
        } else {
            try {
                const markdown = await this.app.vault.cachedRead(file);
                if (generation !== this.generation) return;
                await MarkdownRenderer.render(this.app, readableBody(markdown), body, file.path, component);
            } catch (error) {
                log.error(`[Reader] could not render ${chapter.path}: ${error instanceof Error ? error.message : String(error)}`);
                body.createDiv({ cls: c("reader-missing"), text: t("reader_missing") });
            }
        }
        if (generation !== this.generation) return;
        component.registerDomEvent(body, "click", (event) => this.onLink(event));

        const last = this.index === total - 1;
        const next = page.createDiv({ cls: c("reader-next") }).createEl("button", {
            cls: c("reader-next-button"),
            attr: { type: "button" },
            text: last ? t("reader_finish") : t("reader_next_named", noteName(this.path.chapters[this.index + 1].path)),
        });
        component.registerDomEvent(next, "click", () => (last ? exitReader(this.app, this.leaf) : this.go(1)));
    }

    /**
     * A link inside a chapter. One to a chapter of this reading turns the page to it; any other
     * opens the note in a tab beside the reader. Peeks and detours arrive with R3 (#670).
     */
    private onLink(event: MouseEvent): void {
        const target = (event.target as HTMLElement | null)?.closest?.("a.internal-link");
        if (!target || !this.path) return;
        const href = target.getAttribute("data-href") ?? target.getAttribute("href");
        if (!href) return;
        event.preventDefault();
        const source = this.path.chapters[this.index].path;
        const file = this.app.metadataCache.getFirstLinkpathDest(href.split("#")[0], source);
        const at = file ? this.path.chapters.findIndex((chapter) => chapter.path === file.path) : -1;
        if (at >= 0) this.show(at);
        else void this.app.workspace.openLinkText(href, source, "tab");
    }

    private show(index: number): void {
        if (!this.path) return;
        this.index = Math.max(0, Math.min(index, this.path.chapters.length - 1));
        this.render();
        this.app.workspace.requestSaveLayout();
        this.rememberPlace();
    }

    private go(delta: number): void {
        if (!this.path) return;
        const next = this.index + delta;
        if (next < 0 || next >= this.path.chapters.length) return;
        this.show(next);
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
        const map = buildEvidenceMap(index.getModel(), this.path.chapters[this.index].path);
        const list = (key: LocaleKey, paths: string[]) => {
            if (paths.length === 0) return;
            host.createDiv({ cls: c("reader-context-heading"), text: t(key) });
            for (const p of paths) host.createDiv({ cls: c("reader-context-row"), text: noteName(p) });
        };
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
            case "Escape":
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
