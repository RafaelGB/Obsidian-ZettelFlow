import type { KnowledgeModel } from "../model/KnowledgeModel";
import { noteNeighbourhood } from "../state/neighbourhood";
import { findContradictions } from "../query/findContradictionLogic";
import { buildEvidenceMap } from "../synthesis/evidenceMap";
import { sharedContext } from "./sharedContext";
import type { Vocabulary } from "./vocabulary";
import { namedBy, type AlongsideThought, type NearItem, type NearReason } from "./near";

/**
 * **Six lenses over one list** (#754 FR-5, FR-7, AC-2) — what is near a passage, seen through what
 * your vault already knows about it. Each lens is fed by an engine that exists; nothing parallel is
 * built:
 *
 * | Lens | Fed by |
 * |---|---|
 * | Connections | the typed neighbourhood (supports, expands, inspired-by, example, implements, plain links) and shared context |
 * | Contradictions | the contradiction query: tensions you have already typed |
 * | Questions | the evidence map's open questions, and your *Question* highlights in this book |
 * | Your knowledge | the near notes named here, and your highlights from **other** sources that link or name them |
 * | Research | the evidence map: sourced claims, and an unsourced claim said as unsourced |
 * | Not yet notes | Think thoughts — not highlights — that link or name a near note |
 *
 * Items are ordered by **why** they are here (named, born from it, linked, shared context, marked),
 * then by title. There is no score and no count. Pure and Obsidian-free.
 */

export const LENSES = ["connections", "contradictions", "questions", "knowledge", "research", "unripe"] as const;
export type Lens = (typeof LENSES)[number];

/** Why an item is in Alongside: one line in your words (FR-4). */
export type AlongsideWhy = Exclude<NearReason, "chapter-note"> | "linked" | "shared" | "contradicts" | "question" | "claim" | "cites" | "unsourced" | "highlight" | "thought";

export interface AlongsideItem {
    /** One identity across lenses and redraws: `note:<path>`, `claim:<note>#<claim>`, `thought:<id>`. */
    key: string;
    lens: Lens;
    /** What a click reads: the note, the claim's note, or the thought's file. */
    path: string;
    title: string;
    why: AlongsideWhy;
    /** What the why names: a note's title, a page, a book. */
    detail?: string;
    /** The thought this item is, when it is one. */
    thought?: string;
    /** A tension: it offers *Look at both* and *Not related* (FR-9). */
    tension?: boolean;
}

export interface LensContext {
    vocabulary: Vocabulary;
    book?: string;
    thoughts?: readonly AlongsideThought[];
    /** Ruled out for this chapter: never shown (FR-9). */
    ruledOut?: ReadonlySet<string>;
    /** A pair ruled out as a gap (#534): not offered as shared context. */
    ruledOutGap?: (a: string, b: string) => boolean;
    /** The note on screen in a note reading: it is never listed beside itself. */
    chapterNote?: string;
}

/** The typed relations that are *connections*; a contradiction and a question have lenses of their own. */
const CONNECTION_TYPES = new Set(["link", "supports", "expands", "inspired-by", "example", "implements"]);
/** How many unlinked notes sharing context each near note brings. */
const SHARED_PER_NOTE = 3;

const WHY_RANK: Record<AlongsideWhy, number> = {
    "linked-here": -1,
    named: 0,
    "born-chapter": 1,
    "born-book": 2,
    linked: 3,
    contradicts: 3,
    question: 3,
    claim: 3,
    cites: 3,
    unsourced: 3,
    shared: 4,
    mark: 5,
    highlight: 5,
    thought: 5,
};

/** How a source reads in a line: a file's name without its folder or extension, a citation as written. */
function sourceName(ref: string): string {
    const name = (ref.split("/").pop() ?? ref).replace(/\.(md|pdf|epub)$/i, "").trim();
    return name.length > 60 ? `${name.slice(0, 59)}…` : name;
}

function compare(a: AlongsideItem, b: AlongsideItem): number {
    return WHY_RANK[a.why] - WHY_RANK[b.why] || a.title.localeCompare(b.title, "en") || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

/** A thought links or names one of these notes. */
function mentions(thought: AlongsideThought, paths: ReadonlySet<string>, vocabulary: Vocabulary): boolean {
    if (thought.links.some((link) => paths.has(link.to))) return true;
    return namedBy(vocabulary, thought).some((path) => paths.has(path));
}

export function alongsideLenses(model: KnowledgeModel, near: readonly NearItem[], context: LensContext): Record<Lens, AlongsideItem[]> {
    const lenses: Record<Lens, Map<string, AlongsideItem>> = {
        connections: new Map(),
        contradictions: new Map(),
        questions: new Map(),
        knowledge: new Map(),
        research: new Map(),
        unripe: new Map(),
    };
    const hidden = (path: string) => path === context.chapterNote || path === context.book || (context.ruledOut?.has(path) ?? false);
    const title = (path: string) => model.get(path)?.title ?? path;
    const put = (lens: Lens, item: Omit<AlongsideItem, "lens">) => {
        if (item.key.startsWith("note:") && (hidden(item.path) || !model.get(item.path))) return;
        const list = lenses[lens];
        const held = list.get(item.key);
        if (held && WHY_RANK[held.why] <= WHY_RANK[item.why]) return;
        list.set(item.key, { ...item, lens });
    };
    const noteItem = (path: string, why: AlongsideWhy, detail?: string): Omit<AlongsideItem, "lens"> => ({
        key: `note:${path}`,
        path,
        title: title(path),
        why,
        ...(detail ? { detail } : {}),
    });

    const nearPaths = new Set(near.map((item) => item.path));
    for (const item of near) {
        const focus = item.title;
        const why: AlongsideWhy = item.reason === "chapter-note" ? "linked" : item.reason;
        if (item.reason !== "chapter-note") put("connections", noteItem(item.path, why, item.detail));
        if (item.reason === "named") put("knowledge", noteItem(item.path, "named"));

        for (const neighbour of noteNeighbourhood(model, item.path, []).neighbours) {
            if (nearPaths.has(neighbour.path)) continue;
            const types = [neighbour.outType, neighbour.inType].filter((type): type is string => Boolean(type));
            if (neighbour.cls === "contradicts" || !types.some((type) => CONNECTION_TYPES.has(type))) continue;
            put("connections", noteItem(neighbour.path, "linked", focus));
        }
        for (const shared of sharedContext(model, item.path, SHARED_PER_NOTE, context.ruledOutGap)) {
            if (nearPaths.has(shared.path)) continue;
            put("connections", noteItem(shared.path, "shared", focus));
        }
        for (const other of findContradictions(model, item.path)) {
            put("contradictions", { ...noteItem(other, "contradicts", focus), tension: true });
        }
        const map = buildEvidenceMap(model, item.path);
        for (const question of map.gaps.openQuestions) put("questions", noteItem(question, "question", focus));
        for (const entry of map.evidence) {
            // A note whose only claim is itself (a `source` and no claim text) is the note, citing its source.
            if (entry.claim === title(entry.note)) put("research", noteItem(entry.note, "cites", sourceName(entry.source.ref)));
            else put("research", { key: `claim:${entry.note}#${entry.claim}`, path: entry.note, title: entry.claim, why: "claim", detail: title(entry.note) });
        }
        for (const claim of map.gaps.unsourcedClaims) {
            put("research", { key: `claim:${claim.note}#${claim.claim}`, path: claim.note, title: claim.claim, why: "unsourced", detail: title(claim.note) });
        }
    }

    for (const thought of context.thoughts ?? []) {
        const item = (why: AlongsideWhy, detail?: string): Omit<AlongsideItem, "lens"> => ({
            key: `thought:${thought.id}`,
            path: thought.file ?? thought.about ?? "",
            title: thought.title,
            why,
            thought: thought.id,
            ...(detail ? { detail } : {}),
        });
        if (thought.highlight) {
            const here = Boolean(context.book) && thought.about === context.book;
            if (here && thought.meaning === "question") put("questions", item("highlight", thought.aboutTitle));
            else if (!here && thought.about && nearPaths.size > 0 && mentions(thought, nearPaths, context.vocabulary)) put("knowledge", item("highlight", thought.aboutTitle));
            continue;
        }
        if (nearPaths.size === 0) continue;
        const named = near.find((n) => thought.links.some((link) => link.to === n.path)) ?? near.find((n) => namedBy(context.vocabulary, thought).includes(n.path));
        if (named) put("unripe", item("thought", named.title));
    }

    const out = {} as Record<Lens, AlongsideItem[]>;
    for (const lens of LENSES) out[lens] = [...lenses[lens].values()].sort(compare);
    return out;
}

/** *All* (FR-5): each item once, tagged with its first lens in the lenses' order, then sorted as one. */
export function allOf(lenses: Readonly<Record<Lens, readonly AlongsideItem[]>>): AlongsideItem[] {
    const seen = new Map<string, AlongsideItem>();
    for (const lens of LENSES) for (const item of lenses[lens]) if (!seen.has(item.key)) seen.set(item.key, item);
    return [...seen.values()].sort(compare);
}
