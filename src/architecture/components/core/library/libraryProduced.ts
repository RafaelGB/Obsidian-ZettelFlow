import { TFile, type App, type Component } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import { openQuestions } from "architecture/knowledge/state";
import { hoverPreview } from "architecture/components/core/a11y";
import { activateSurface } from "architecture/plugin/services/ViewActivation";
import { MOTION, motionWelcome } from "architecture/components/core/reader/readerMotion";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { notesBornFrom } from "application/library/born";
import type { ShelfArticle, ShelfItem } from "application/library/shelf";
import {
    PRODUCED_ORDER,
    PRODUCED_SHOWN,
    producedNothing,
    whatItProduced,
    type ProducedChallenge,
    type ProducedEnd,
    type ProducedListId,
    type ProducedLists,
    type ProducedNote,
    type ProducedPair,
    type ProducedThought,
} from "application/library/produced";
import { FLIP_KEY, flipMove } from "./libraryFlip";
import { gatherBookNotes } from "./bookNoteIndex";
import { articleResolver } from "./libraryShelf";
import type { OpenAt } from "./libraryOpen";

type LocaleKey = Parameters<typeof t>[0];

/** Literal maps, so the locale guardrail sees every key the section draws. */
const LIST_KEY: Record<ProducedListId, LocaleKey> = {
    born: "shelf_detail_born_title",
    ideas: "shelf_produced_ideas",
    links: "shelf_produced_links",
    tensions: "shelf_produced_tensions",
    questions: "shelf_produced_questions",
    unresolved: "shelf_produced_unresolved",
};
const TYPE_KEY: Record<string, LocaleKey> = {
    supports: "relation_type_supports",
    contradicts: "relation_type_contradicts",
    expands: "relation_type_expands",
    "inspired-by": "relation_type_inspired_by",
    question: "relation_type_question",
    example: "relation_type_example",
    implements: "relation_type_implements",
};

/** How many rows of one arrival rise in turn (FR-9); the rest are simply there. */
export const PRODUCED_STAGGERED = 8;
/** The step between two rising rows. */
export const PRODUCED_STEP_MS = 30;

export interface ProducedParts {
    app: App;
    scope: Component;
    item: ShelfItem;
    /** The six lists, or `null` while the vault is still being read (FR-7). */
    gather(): Promise<ProducedLists | null>;
    /** Open the source at a chapter, or at one highlight. */
    open(at: OpenAt): void;
    /** Shown before in this Library: the lists are simply there (FR-9). */
    seen: boolean;
    /** The lists were drawn. */
    shown(): void;
    /** Known at last (#822): whether it produced anything — said once. */
    settled?: (hasContent: boolean) => void;
}

function noteName(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

function snippet(text: string, max = 140): string {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function typeName(type: string): string {
    const key = TYPE_KEY[type];
    return (key ? t(key) : type).toLowerCase();
}

function endLabel(end: ProducedEnd): string {
    return end.kind === "note" ? end.title : `“${snippet(end.thought.quote?.exact || end.thought.text, 60)}”`;
}

/**
 * Rows arriving (FR-9, FR-10): each fades in and rises 4 px, 30 ms after the one before, at most
 * eight in turn; the rest are simply there. Transform and opacity only, on the shared curve.
 */
export function arrive(rows: readonly HTMLElement[]): void {
    rows.slice(0, PRODUCED_STAGGERED).forEach((row, i) => {
        if (!motionWelcome(row)) return;
        row.animate(
            [
                { opacity: 0, transform: "translateY(4px)" },
                { opacity: 1, transform: "translateY(0px)" },
            ],
            { duration: MOTION.base, easing: MOTION.ease, delay: i * PRODUCED_STEP_MS, fill: "backwards" }
        );
    });
}

/**
 * **What it produced in your vault** (#752): the detail's *Notes born from it*, grown into the lists
 * of what the source changed — the notes born, the ideas they led to, the links you made, the
 * tensions, the open questions, and what you marked and have not dealt with. Lists, never a score;
 * every item opens what it names; nothing is written.
 */
export function renderProduced(parent: HTMLElement, parts: ProducedParts): HTMLElement {
    // Nothing is drawn until it is known (#822): no *Reading your vault…*, no empty heading.
    const section = parent.createDiv({ cls: [c("shelf-produced"), c("shelf-detail-quiet")] });
    const heading = section.createEl("h3", { cls: c("shelf-section"), text: t("shelf_produced_title") });
    const body = section.createDiv({ cls: c("shelf-produced-body") });
    let settled = false;
    const settle = (has: boolean) => {
        if (settled) return;
        settled = true;
        parts.settled?.(has);
    };
    let drawn = false;
    let asking = false;
    const ask = () => {
        if (drawn || asking) return;
        asking = true;
        void parts
            .gather()
            .then((lists) => {
                asking = false;
                if (!lists || drawn || body.isConnected === false) return;
                drawn = true;
                const has = !producedNothing(lists);
                if (has) section.removeClass(c("shelf-detail-quiet"));
                else heading.remove();
                draw(section, body, lists, parts);
                settle(has);
            })
            .catch((error: unknown) => {
                asking = false;
                log.warn(`[Library] could not read what ${parts.item.id} produced: ${String(error)}`);
                settle(false);
            });
    };
    // The vault still being read: the section fills in once the model is ready, the rest is usable meanwhile.
    const cache = parts.app.metadataCache as { on?: (name: "resolved", fn: () => void) => unknown } | undefined;
    if (typeof cache?.on === "function") parts.scope.registerEvent(cache.on("resolved", ask) as never);
    ask();
    return section;
}

function draw(section: HTMLElement, body: HTMLElement, lists: ProducedLists, parts: ProducedParts): void {
    body.empty();
    if (producedNothing(lists)) {
        parts.shown();
        return;
    }
    const arrived: HTMLElement[] = [];
    for (const id of PRODUCED_ORDER) {
        const items = lists[id] as readonly unknown[];
        if (items.length === 0) continue;
        const list = body.createDiv({ cls: c("shelf-produced-list"), attr: { [FLIP_KEY]: `produced:${id}`, "data-list": id } });
        list.createEl("h4", { cls: c("shelf-produced-heading"), text: t(LIST_KEY[id]) });
        const rows = list.createDiv({ cls: c("shelf-produced-rows") });
        for (const entry of items.slice(0, PRODUCED_SHOWN)) arrived.push(row(rows, id, entry, parts));
        if (items.length <= PRODUCED_SHOWN) continue;
        const more = list.createEl("button", { cls: c("shelf-produced-more"), attr: { type: "button" }, text: t("shelf_produced_show_all") });
        parts.scope.registerDomEvent(more, "click", () => {
            // The rest arrive in place; the lists below make room by a translate (FR-10).
            const added: HTMLElement[] = [];
            // What follows the section in the detail — the highlights — glides down with the lists.
            const host = section.parentElement ?? body;
            const siblings = Array.from(host.children) as HTMLElement[];
            siblings.slice(siblings.indexOf(section) + 1).forEach((el, i) => {
                if (!el.getAttribute(FLIP_KEY)) el.setAttribute(FLIP_KEY, `produced-after:${i}`);
            });
            flipMove(host, () => {
                more.remove();
                for (const entry of items.slice(PRODUCED_SHOWN)) added.push(row(rows, id, entry, parts));
            });
            arrive(added);
        });
    }
    if (!parts.seen) arrive(arrived);
    parts.shown();
}

function row(rows: HTMLElement, id: ProducedListId, entry: unknown, parts: ProducedParts): HTMLElement {
    const { app, scope } = parts;
    const button = rows.createEl("button", { cls: c("shelf-produced-row"), attr: { type: "button" } });
    if (id === "unresolved") {
        const thought = entry as ProducedThought;
        button.addClass(c("shelf-produced-row--passage"));
        if (thought.quote?.exact) button.createEl("q", { cls: c("shelf-produced-quote"), text: snippet(thought.quote.exact) });
        else if (thought.text.trim()) button.createSpan({ cls: c("shelf-produced-quote"), text: snippet(thought.text) });
        if (thought.locator?.label) button.createSpan({ cls: c("shelf-produced-where"), text: thought.locator.label });
        scope.registerDomEvent(button, "click", () => parts.open({ chapter: chapterOf(parts.item, thought), highlight: thought.id }));
        return button;
    }
    if (id === "links" || (id === "tensions" && (entry as ProducedPair | ProducedChallenge).kind === "pair")) {
        const pair = entry as ProducedPair;
        const a = endLabel(pair.a);
        const text = pair.type ? t("shelf_produced_pair_named", a, pair.b.title, typeName(pair.type)) : t("shelf_produced_pair", a, pair.b.title);
        button.addClass(c("shelf-produced-row--pair"));
        button.createSpan({ cls: c("shelf-produced-name"), text });
        scope.registerDomEvent(button, "click", () => void openPair(app, pair));
        return button;
    }
    if (id === "tensions") {
        const challenge = entry as ProducedChallenge;
        button.addClass(c("shelf-produced-row--passage"));
        const quote = challenge.highlight.quote?.exact || challenge.highlight.text;
        if (quote) button.createEl("q", { cls: c("shelf-produced-quote"), text: snippet(quote) });
        if (challenge.thought.text.trim()) button.createSpan({ cls: c("shelf-produced-answer"), text: snippet(challenge.thought.text) });
        const about = challenge.thought.about ?? parts.item.file;
        scope.registerDomEvent(button, "click", () => void activateSurface(app, "zettelflow-home", "lab", about ? { about } : undefined));
        return button;
    }
    const note = entry as ProducedNote;
    if (id === "born") button.createSpan({ cls: c("shelf-born-mark"), text: "◆", attr: { "aria-hidden": "true" } });
    const name = button.createSpan({ cls: c("shelf-produced-name"), text: note.title || noteName(note.path) });
    hoverPreview(app, name, note.path, scope);
    scope.registerDomEvent(button, "click", () => void app.workspace.openLinkText(note.path, "", false));
    return button;
}

/** The chapter a highlight is in: its place in a book, its note in a path. */
function chapterOf(item: ShelfItem, thought: ProducedThought): number | undefined {
    if (item.kind === "path") {
        const at = (item.paths ?? []).indexOf(thought.about ?? "");
        return at >= 0 ? at : undefined;
    }
    return thought.locator?.at;
}

/**
 * A pair, in a split (FR-11): the camera moves, not the page — A and B open beside the Library, one
 * above the other, and the detail stays where it is. A highlight's pair opens its note beside it.
 */
export async function openPair(app: App, pair: ProducedPair): Promise<void> {
    const fileOf = (path: string) => {
        const file = app.vault.getAbstractFileByPath(path);
        return file instanceof TFile ? file : null;
    };
    const b = fileOf(pair.b.path);
    const a = pair.a.kind === "note" ? fileOf(pair.a.path) : null;
    if (!b) return;
    const workspace = app.workspace;
    const leaf = workspace.getLeaf("split", "vertical");
    if (!a) {
        await leaf.openFile(b);
        return;
    }
    await leaf.openFile(a);
    const below = workspace.createLeafBySplit(leaf, "horizontal");
    await below.openFile(b);
}

/**
 * The section's one impure step: read the model, the book notes and the thoughts about the source,
 * all already in memory, and hand them to the pure lists. `null` while the vault is still being read.
 * Reads only.
 */
export async function gatherProduced(
    app: App,
    item: ShelfItem,
    deps: { articles: () => readonly ShelfArticle[]; store?: Pick<ThoughtStore, "thoughtsAbout">; index?: Pick<KnowledgeIndex, "status" | "getModel"> }
): Promise<ProducedLists | null> {
    const index = deps.index ?? KnowledgeIndex.getInstance();
    const store = deps.store ?? ThoughtStore.getInstance();
    const sources = item.kind === "path" ? [...(item.paths ?? [])] : item.file ? [item.file] : [];
    const thoughts = (await Promise.all(sources.map((path) => store.thoughtsAbout(path)))).flat();
    if (item.kind === "path") {
        return whatItProduced({ kind: "path", sources, ideas: [], born: [], bookNotes: new Set(), thoughts, openQuestions: [] });
    }
    if (index.status !== "ready") return null;
    const model = index.getModel();
    const ideas = model.all();
    const bookNotes = new Set([...gatherBookNotes(app).values()].map((note) => note.path));
    const born = item.file ? (notesBornFrom(ideas, bookNotes, articleResolver(deps.articles())).get(item.file) ?? []) : [];
    return whatItProduced({ kind: "source", sources, ideas, born, bookNotes, thoughts, openQuestions: openQuestions(model) });
}
