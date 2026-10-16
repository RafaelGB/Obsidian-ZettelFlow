import type { App, Component } from "obsidian";
import { c, log } from "architecture";
import { t, tCount } from "architecture/lang";
import { detailSentenceParts, type DetailPart, type ShelfItem } from "application/library/shelf";
import type { Thought } from "application/thinking/thought";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import type { OpenAt } from "./libraryOpen";

export interface DetailParts {
    app: App;
    scope: Component;
    cover(parent: HTMLElement): HTMLElement;
    facts(parent: HTMLElement): void;
    scanned(parent: HTMLElement): void;
    lastRead: string;
    open(at?: OpenAt): void;
    close(): void;
    /** Open the source's notebook (#721); absent for a saved path. */
    notebook?: () => void;
    /** The book's note, edited in place (#743); absent for a saved path. */
    details?: (parent: HTMLElement) => void;
    /** What it produced in your vault (#752), drawn where *Notes born from it* was; says when it knows (#822). */
    produced?: (parent: HTMLElement, settled: (hasContent: boolean) => void) => void;
    /** *Cite this book* (#768 FR-1): the cite panel, grown from the button; absent for a saved path. */
    cite?: (from: HTMLElement) => void;
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
 * highlights, what it produced in your vault (#752) — and every highlight, grouped, each one a way
 * back to the passage. Writes nothing itself: its *Details* (#743) write the book's note, and only
 * when you change something.
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
    // Everything you marked in it, in one place (#721).
    if (parts.notebook && item.kind !== "path") {
        const notebook = actions.createEl("button", { attr: { type: "button" }, text: t("notebook_title") });
        scope.registerDomEvent(notebook, "click", () => parts.notebook?.());
    }
    // The whole source, cited (#768 FR-1): no passage, the panel growing from the button.
    if (parts.cite && item.kind !== "path") {
        const cite = actions.createEl("button", { attr: { type: "button", "data-zf-cite": "" }, text: t("shelf_cite_book") });
        scope.registerDomEvent(cite, "click", () => parts.cite?.(cite));
    }
    const close = actions.createEl("button", { attr: { type: "button" }, text: t("shelf_close") });
    scope.registerDomEvent(close, "click", () => parts.close());

    // What came of it, in one sentence (#822): only what is there — never a box, never a zero.
    const said = detailSentenceParts(item).map((part) => sentencePart(part, parts.lastRead));
    if (said.length > 0) what.createEl("p", { cls: c("shelf-detail-sentence"), text: said.join(" · ") });

    // What the book is and what it is to you, part of the same sheet (#743 FR-14).
    if (item.kind !== "path") parts.details?.(aside);

    // The two sections that may hold nothing (#822): each is drawn once it has something, and when
    // both have nothing one quiet line says so — never two empty headings.
    const quiet = quietSections(aside, ["highlights", "produced"]);

    // What it produced in your vault (#752): the notes born from it, grown into the lists of what it changed.
    if (parts.produced) parts.produced(aside, (has) => quiet("produced", has));
    else quiet("produced", false);

    const heading = aside.createEl("h3", { cls: [c("shelf-section"), c("shelf-detail-highlights-title")], text: t("shelf_detail_highlights_title") });
    heading.addClass(c("shelf-detail-quiet"));
    const list = aside.createDiv({ cls: c("shelf-detail-highlights") });
    void loadHighlights(item)
        .then((thoughts) => {
            if (list.isConnected === false) return; // the detail was closed or redrawn meanwhile
            list.empty();
            const groups = groupHighlights(item, thoughts);
            quiet("highlights", groups.length > 0);
            if (groups.length === 0) return;
            heading.removeClass(c("shelf-detail-quiet"));
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
            quiet("highlights", false);
        });
}

/** A part of the sentence, in words. */
function sentencePart(part: DetailPart, when: string): string {
    if (part.kind === "read") return t("shelf_detail_part_read", String(part.percent), when);
    if (part.kind === "started") return t("shelf_detail_part_started", when);
    if (part.kind === "finished") return t("shelf_detail_part_finished", when);
    if (part.kind === "highlights") return tCount(part.n, "shelf_detail_part_highlights", String(part.n));
    return tCount(part.n, "shelf_detail_part_born", String(part.n));
}

/**
 * The sections that may hold nothing, settled one by one: once every one has said it is empty, a
 * single line says so — *Nothing marked or made from it yet* — and says it once.
 */
function quietSections(aside: HTMLElement, waiting: string[]): (section: string, hasContent: boolean) => void {
    const pending = new Set(waiting);
    let any = false;
    return (section, hasContent) => {
        if (!pending.delete(section)) return;
        any = any || hasContent;
        if (pending.size > 0 || any || aside.isConnected === false) return;
        aside.createDiv({ cls: c("shelf-detail-nothing"), text: t("shelf_detail_nothing_yet") });
    };
}

async function loadHighlights(item: ShelfItem): Promise<Thought[]> {
    const store = ThoughtStore.getInstance();
    if (item.kind === "path") {
        const all = await Promise.all((item.paths ?? []).map((path) => store.highlightsAbout(path)));
        return all.flat();
    }
    return item.file ? store.highlightsAbout(item.file) : [];
}
