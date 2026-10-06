import type { App, Component } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { hoverPreview } from "architecture/components/core/a11y";
import type { ShelfItem } from "application/library/shelf";
import type { Thought } from "application/thinking/thought";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import type { OpenAt } from "./libraryOpen";

export interface DetailParts {
    app: App;
    scope: Component;
    /** The notes citing this source. */
    born: readonly string[];
    cover(parent: HTMLElement): HTMLElement;
    facts(parent: HTMLElement): void;
    scanned(parent: HTMLElement): void;
    lastRead: string;
    open(at?: OpenAt): void;
    close(): void;
}

/** One group of highlights: a chapter of a book, a page of a paper, a note of a path. */
export interface HighlightGroup {
    label: string;
    /** The chapter to open at. */
    chapter?: number;
    items: Thought[];
}

function noteName(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/** Snippet of a passage, short enough for a list. */
function snippet(text: string, max = 220): string {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * A source's highlights by where they were made — the chapter or page each was kept under — in
 * reading order. A path's, by the note each was made on, in the order the path reads them.
 */
export function groupHighlights(item: ShelfItem, thoughts: readonly Thought[]): HighlightGroup[] {
    if (item.kind === "path") {
        return (item.paths ?? [])
            .map((path, chapter) => ({
                label: noteName(path),
                chapter,
                items: thoughts.filter((thought) => thought.about === path),
            }))
            .filter((group) => group.items.length > 0);
    }
    const groups: HighlightGroup[] = [];
    const byLabel = new Map<string, HighlightGroup>();
    // In reading order: by the page or chapter it was made on (#681), then by when.
    const place = (thought: Thought) => thought.locator?.at ?? Number.MAX_SAFE_INTEGER;
    for (const thought of [...thoughts].sort((a, b) => place(a) - place(b) || a.at - b.at)) {
        const label = thought.locator?.label || thought.quote?.heading || "";
        let group = byLabel.get(label);
        if (!group) {
            group = { label, ...(thought.locator ? { chapter: thought.locator.at } : {}), items: [] };
            byLabel.set(label, group);
            groups.push(group);
        }
        group.items.push(thought);
    }
    return groups;
}

/**
 * **A source, in detail** (#680): its cover and what it is, what came of it — the reading, the
 * highlights, the notes born from it — and every highlight, grouped, each one a way back to the
 * passage. Writes nothing.
 */
export function renderDetail(aside: HTMLElement, item: ShelfItem, parts: DetailParts): void {
    const { scope } = parts;
    const top = aside.createDiv({ cls: c("shelf-detail-top") });
    parts.cover(top);
    const what = top.createDiv({ cls: c("shelf-detail-what") });
    what.createEl("h2", { cls: c("shelf-detail-title"), text: item.title });
    if (item.author) what.createDiv({ cls: c("shelf-card-author"), text: item.author });
    what.createDiv({ cls: c("shelf-detail-file"), text: item.file ?? t("shelf_detail_path_file") });
    if (item.imageOnly) {
        const scanned = what.createDiv({ cls: c("shelf-meta") });
        parts.scanned(scanned);
    }
    const actions = what.createDiv({ cls: c("shelf-detail-actions") });
    const open = actions.createEl("button", { cls: "mod-cta", attr: { type: "button" }, text: t("shelf_open") });
    scope.registerDomEvent(open, "click", () => parts.open());
    const close = actions.createEl("button", { attr: { type: "button" }, text: t("shelf_close") });
    scope.registerDomEvent(close, "click", () => parts.close());

    const stats = aside.createDiv({ cls: c("shelf-detail-stats") });
    const stat = (value: string, label: string, extra?: string) => {
        const cell = stats.createDiv({ cls: [c("shelf-detail-stat"), ...(extra ? [c(extra)] : [])] });
        cell.createDiv({ cls: c("shelf-detail-stat-value"), text: value });
        cell.createDiv({ cls: c("shelf-detail-stat-label"), text: label });
    };
    stat(t("shelf_percent", String(Math.round(item.progress * 100))), t("shelf_detail_read", parts.lastRead));
    stat(String(item.highlights), t("shelf_detail_highlights"));
    if (item.kind !== "path") stat(String(item.born), t("shelf_detail_born"), item.born > 0 ? "shelf-detail-stat--born" : undefined);

    if (parts.born.length > 0) {
        aside.createEl("h3", { cls: c("shelf-section"), text: t("shelf_detail_born_title") });
        const list = aside.createDiv({ cls: c("shelf-born-list") });
        for (const path of parts.born) {
            const row = list.createEl("button", { cls: c("shelf-born-row"), attr: { type: "button" } });
            row.createSpan({ cls: c("shelf-born-mark"), text: "◆", attr: { "aria-hidden": "true" } });
            const name = row.createSpan({ cls: c("shelf-born-name"), text: noteName(path) });
            hoverPreview(parts.app, name, path, scope);
            scope.registerDomEvent(row, "click", () => void parts.app.workspace.openLinkText(path, "", false));
        }
    }

    aside.createEl("h3", { cls: c("shelf-section"), text: t("shelf_detail_highlights_title") });
    const list = aside.createDiv({ cls: c("shelf-detail-highlights") });
    list.createDiv({ cls: c("shelf-detail-empty"), text: t("shelf_detail_loading") });
    void loadHighlights(item)
        .then((thoughts) => {
            if (list.isConnected === false) return; // the detail was closed or redrawn meanwhile
            list.empty();
            const groups = groupHighlights(item, thoughts);
            if (groups.length === 0) {
                list.createDiv({ cls: c("shelf-detail-empty"), text: t("shelf_detail_no_highlights") });
                return;
            }
            for (const group of groups) {
                if (group.label) list.createDiv({ cls: c("shelf-detail-group"), text: group.label });
                for (const thought of group.items) {
                    const row = list.createEl("button", { cls: c("shelf-highlight"), attr: { type: "button" } });
                    // A note in the margin of a scanned page has no passage, only what you wrote.
                    if (thought.quote?.exact) row.createEl("q", { cls: c("shelf-highlight-quote"), text: snippet(thought.quote.exact) });
                    if (thought.text.trim()) row.createDiv({ cls: c("shelf-highlight-note"), text: thought.text.trim() });
                    row.createDiv({ cls: c("shelf-highlight-where"), text: t("shelf_highlight_open") });
                    scope.registerDomEvent(row, "click", () => parts.open({ chapter: group.chapter, highlight: thought.id }));
                }
            }
        })
        .catch((error: unknown) => {
            log.warn(`[Library] could not list highlights of ${item.id}: ${String(error)}`);
            list.empty();
            list.createDiv({ cls: c("shelf-detail-empty"), text: t("shelf_detail_no_highlights") });
        });
}

async function loadHighlights(item: ShelfItem): Promise<Thought[]> {
    const store = ThoughtStore.getInstance();
    if (item.kind === "path") {
        const all = await Promise.all((item.paths ?? []).map((path) => store.highlightsAbout(path)));
        return all.flat();
    }
    return item.file ? store.highlightsAbout(item.file) : [];
}
