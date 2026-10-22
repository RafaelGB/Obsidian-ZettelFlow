import { displayName } from "application/library/displayName";
import { sourceFormat } from "application/library/sourceMeta";
import type { Thought, ThoughtLocator } from "./thought";
import { flattenThread, type ThoughtNode } from "./thread";

/**
 * **Thinking by source** (#874) — pure.
 *
 * A thought written in the Reader knows the book, the PDF or the note it was about, and a highlight
 * knows its place in it. This is what lets Think be read **one source at a time, in the source's
 * order**: the sources your thoughts came from, which of them a thread belongs to, and the order a
 * book's thinking reads in — chapter by chapter, the way you read it.
 *
 * Two things this never does. It never opens a source: everything here comes from the thoughts
 * already in memory. And it never says how much: a source is a name and a time, never a tally of the
 * thoughts behind it (#469) — the find bar narrows, it does not report.
 */

export type SourceKind = "book" | "pdf" | "note";

/** One source a thought is about: what it is and when you last thought about it. */
export interface LabSource {
    path: string;
    kind: SourceKind;
    name: string;
    /** When the newest thought about it was written — what the picker's *recent first* goes by. */
    newest: number;
}

/** A book is an EPUB, a PDF is a PDF, and anything else a thought can be about reads as a note. */
export function sourceKind(path: string): SourceKind {
    const format = sourceFormat(path);
    if (format === "epub") return "book";
    if (format === "pdf") return "pdf";
    return "note";
}

/** The sources one thought is from: its subject, and a collision's second subject. */
export function sourcesOf(thought: Pick<Thought, "about" | "alsoAbout">): string[] {
    return [thought.about, thought.alsoAbout].filter((path): path is string => typeof path === "string" && path.length > 0);
}

/**
 * Every source the thoughts are about, recent first (#874 FR-1, FR-5). Named the way Think names them
 * (the Library's title when it has one). Reads the thoughts and the Library's metadata only.
 */
export function labSources(thoughts: readonly Thought[], library: unknown): LabSource[] {
    const newest = new Map<string, number>();
    for (const thought of thoughts) {
        for (const path of sourcesOf(thought)) newest.set(path, Math.max(newest.get(path) ?? 0, thought.at));
    }
    return [...newest.entries()]
        .map(([path, at]) => ({ path, kind: sourceKind(path), name: displayName(path, library), newest: at }))
        .sort((a, b) => b.newest - a.newest || a.name.localeCompare(b.name));
}

// ── reading order ────────────────────────────────────────────────────────────

/** What is written above a root in reading order: its source, a place in it, or *no place*. */
export type SourceHead =
    | { kind: "source"; source: string }
    | { kind: "place"; source: string; label: string }
    | { kind: "unplaced"; source: string };

export interface ReadingOrder {
    /** The threads, in the order they are read: what the window slices, unchanged. */
    roots: ThoughtNode[];
    /** The heads to draw before the root at each index — keyed by index, so a page can start anywhere. */
    heads: Map<number, SourceHead[]>;
}

/** Whether a thread holds a thought from `source`. */
function holds(node: ThoughtNode, source: string): boolean {
    return flattenThread(node).some((thought) => sourcesOf(thought).includes(source));
}

/**
 * Where a thread sits in `source` (#874 FR-10): its root's place, when the root is from it, or else
 * the earliest place among its thoughts from it. A note has no places, and neither does a thread
 * whose thoughts never said where they were.
 */
export function threadPlace(node: ThoughtNode, source: string): ThoughtLocator | undefined {
    const root = node.thought;
    if (root.locator && sourcesOf(root).includes(source)) return root.locator;
    let earliest: ThoughtLocator | undefined;
    for (const thought of flattenThread(node)) {
        if (!thought.locator || !sourcesOf(thought).includes(source)) continue;
        if (!earliest || before(thought.locator, earliest)) earliest = thought.locator;
    }
    return earliest;
}

/** The print page as a number, when the source declared one that reads as a number. */
function pageOf(locator: ThoughtLocator): number | undefined {
    const page = locator.page ? Number.parseInt(locator.page, 10) : Number.NaN;
    return Number.isFinite(page) ? page : undefined;
}

/** Chapter first, then the print page when both know it. */
function before(a: ThoughtLocator, b: ThoughtLocator): boolean {
    return comparePlaces(a, b) < 0;
}

function comparePlaces(a: ThoughtLocator, b: ThoughtLocator): number {
    if (a.at !== b.at) return a.at - b.at;
    const pa = pageOf(a);
    const pb = pageOf(b);
    return pa !== undefined && pb !== undefined ? pa - pb : 0;
}

/**
 * Think in the order a source is read (#874 FR-10) — a separate ordering **you chose**, never a ranking
 * of what matched (#469, the find still never reorders):
 *
 * - the picked sources one after another, in the order you picked them, each under its own head when
 *   there are two or more;
 * - a book or a PDF by place — chapter, then print page — under a head per place, oldest first at the
 *   same place, the threads with no place last under one head that says so;
 * - a note by date, newest first, with no place heads;
 * - a thread from two picked sources once, under the first of them you picked.
 */
export function readingOrder(roots: readonly ThoughtNode[], picked: readonly string[]): ReadingOrder {
    const ordered: ThoughtNode[] = [];
    const heads = new Map<number, SourceHead[]>();
    const taken = new Set<ThoughtNode>();
    const headAt = (index: number, head: SourceHead) => {
        const list = heads.get(index);
        if (list) list.push(head);
        else heads.set(index, [head]);
    };

    for (const source of picked) {
        const block = roots.filter((node) => !taken.has(node) && holds(node, source));
        if (block.length === 0) continue;
        for (const node of block) taken.add(node);
        if (picked.length > 1) headAt(ordered.length, { kind: "source", source });

        if (sourceKind(source) === "note") {
            ordered.push(...[...block].sort((a, b) => b.thought.at - a.thought.at));
            continue;
        }
        const placed = block
            .map((node) => ({ node, place: threadPlace(node, source) }))
            .filter((entry): entry is { node: ThoughtNode; place: ThoughtLocator } => entry.place !== undefined)
            .sort((a, b) => comparePlaces(a.place, b.place) || a.node.thought.at - b.node.thought.at);
        let label: string | undefined;
        for (const { node, place } of placed) {
            if (place.label !== label) {
                label = place.label;
                headAt(ordered.length, { kind: "place", source, label });
            }
            ordered.push(node);
        }
        const unplaced = block.filter((node) => threadPlace(node, source) === undefined).sort((a, b) => a.thought.at - b.thought.at);
        if (unplaced.length > 0) headAt(ordered.length, { kind: "unplaced", source });
        ordered.push(...unplaced);
    }
    // What none of the picked sources claims (a thread kept by another of its thoughts) still shows.
    ordered.push(...roots.filter((node) => !taken.has(node)));
    return { roots: ordered, heads };
}

// ── the spine ────────────────────────────────────────────────────────────────

/** One tick on the spine: which thread, how far into the source, and the place's own name. */
export interface SpineEntry {
    id: string;
    share: number;
    label: string;
}

/**
 * Where each thread sits along a book or a PDF (#874 FR-13), as a share of the way through: over the
 * whole source when its length is known without opening it, or else up to the furthest place shown.
 * A place, never a number of thoughts.
 */
export function spinePositions(entries: readonly { id: string; place: ThoughtLocator }[], length?: number): SpineEntry[] {
    const furthest = entries.reduce((max, entry) => Math.max(max, entry.place.at), 0);
    const span = length && length > 0 ? length : furthest;
    return entries.map((entry) => ({
        id: entry.id,
        share: span > 0 ? Math.min(1, entry.place.at / span) : 0,
        label: entry.place.label,
    }));
}

// ── the filter's state ───────────────────────────────────────────────────────

export type SourceOrder = "reading" | "newest";

/** The sources you picked, in the order you picked them, and how they are read. View state only. */
export interface SourceFilter {
    picked: string[];
    order: SourceOrder;
}

export function noSources(): SourceFilter {
    return { picked: [], order: "reading" };
}

/** Pick one more. The first pick always reads in the source's order (#874 FR-9). */
export function pickSource(state: SourceFilter, path: string): SourceFilter {
    if (state.picked.includes(path)) return state;
    return { picked: [...state.picked, path], order: state.picked.length === 0 ? "reading" : state.order };
}

export function dropSource(state: SourceFilter, path: string): SourceFilter {
    return { ...state, picked: state.picked.filter((entry) => entry !== path) };
}

/** Backspace in an empty find field: the last one you picked goes. */
export function dropLastSource(state: SourceFilter): SourceFilter {
    return { ...state, picked: state.picked.slice(0, -1) };
}

export function clearSources(state: SourceFilter): SourceFilter {
    return { ...state, picked: [] };
}

export function setOrder(state: SourceFilter, order: SourceOrder): SourceFilter {
    return { ...state, order };
}

/**
 * What a new thought is about (#874 FR-14): the one source you picked — or, with none or several, the
 * subject you arrived with. Never one of several picked sources, chosen for you.
 */
export function composerSubject(picked: readonly string[], arrived: string | undefined): string | undefined {
    return picked.length === 1 ? picked[0] : arrived;
}
