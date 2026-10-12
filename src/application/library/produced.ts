import type { Thought } from "application/thinking/thought";

/**
 * **What a source produced in your vault** (#752, epic #742) — pure, over what the knowledge model
 * and Think already hold.
 *
 * A structural projection, never a judgement (§XII): every list is read off links, typed relations,
 * `source` citations, dates and Think's thoughts. Nothing is classified by its text, nothing is
 * proposed, nothing is counted for you and nothing is written. The book's note (#743) is the book
 * itself, so it is in none of the lists and its own links are not links you made.
 */

/** How many items a list shows before *Show all* (FR-3). */
export const PRODUCED_SHOWN = 5;

/** The relation that makes a tension (#147's vocabulary). */
const CONTRADICTS = "contradicts";
/** A plain link carries no relation name (`DEFAULT_RELATION_TYPE`). */
const PLAIN_LINK = "link";

/** The little of an idea this needs. */
export interface ProducedIdea {
    path: string;
    title: string;
    created: number;
    relations: readonly { type: string; to: string }[];
}

/** The little of a thought this needs. */
export type ProducedThought = Pick<Thought, "id" | "at" | "text"> &
    Partial<Pick<Thought, "about" | "quote" | "locator" | "links" | "respondsTo" | "incubated" | "ink" | "madeBy" | "meaning">>;

export interface ProducedInput {
    /** A saved path shows only *Still unresolved* (FR-5). */
    kind: "source" | "path";
    /** The source's own path (or a path's notes): never something it produced. */
    sources: readonly string[];
    ideas: Iterable<ProducedIdea>;
    /** The notes citing the source (`notesBornFrom`). */
    born: readonly string[];
    /** Every book's note in the vault (#743), wherever it is kept. */
    bookNotes: ReadonlySet<string>;
    /** The thoughts about the source: its highlights and what answers them. */
    thoughts: readonly ProducedThought[];
    /** The vault-wide open questions (`openQuestions`). */
    openQuestions: readonly { path: string; askedBy: readonly string[] }[];
}

export interface ProducedNote {
    path: string;
    title: string;
}

/** One end of a pair: a note, or one of the source's highlights. */
export type ProducedEnd = ({ kind: "note" } & ProducedNote) | { kind: "highlight"; thought: ProducedThought };

/** *A ↔ B*, with the relation's name when it has one. */
export interface ProducedPair {
    kind: "pair";
    a: ProducedEnd;
    b: ProducedNote;
    type?: string;
}

/** A highlight of the source answered with a challenge in Think. */
export interface ProducedChallenge {
    kind: "challenge";
    highlight: ProducedThought;
    thought: ProducedThought;
}

export interface ProducedLists {
    born: ProducedNote[];
    ideas: ProducedNote[];
    links: ProducedPair[];
    tensions: (ProducedPair | ProducedChallenge)[];
    questions: ProducedNote[];
    unresolved: ProducedThought[];
}

export type ProducedListId = keyof ProducedLists;

/** The lists in the order the section reads them (FR-1). */
export const PRODUCED_ORDER: readonly ProducedListId[] = ["born", "ideas", "links", "tensions", "questions", "unresolved"];

function compare(a: string, b: string): number {
    const x = a.toLowerCase();
    const y = b.toLowerCase();
    return x < y ? -1 : x > y ? 1 : a < b ? -1 : a > b ? 1 : 0;
}

function noteName(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

const byNote = (a: ProducedNote, b: ProducedNote) => compare(a.title, b.title) || compare(a.path, b.path);

/**
 * A mark you made in the source: a highlight, or a note in the margin of a page with no text. Ink
 * and a move's answer are not marks (#745, #756), and neither is a thought that answers another.
 */
export function isMark(thought: ProducedThought): boolean {
    return Boolean((thought.quote?.exact || thought.locator) && !thought.ink && !thought.madeBy && !thought.respondsTo);
}

function endTitle(end: ProducedEnd): string {
    return end.kind === "note" ? end.title : (end.thought.quote?.exact ?? end.thought.text);
}

function endKey(end: ProducedEnd): string {
    return end.kind === "note" ? `n:${end.path}` : `h:${end.thought.id}`;
}

const byPair = (x: ProducedPair, y: ProducedPair) =>
    compare(endTitle(x.a), endTitle(y.a)) || compare(endKey(x.a), endKey(y.a)) || compare(x.b.title, y.b.title) || compare(x.b.path, y.b.path);

/** A relation's name, when it is more than a plain link. */
function named(type: string): string | undefined {
    return type && type !== PLAIN_LINK ? type : undefined;
}

/**
 * The six lists of FR-1, each deduplicated and in a stable order, whatever order the input came in.
 * An empty list is empty; the section shows only the lists that have something.
 */
export function whatItProduced(input: ProducedInput): ProducedLists {
    const empty: ProducedLists = { born: [], ideas: [], links: [], tensions: [], questions: [], unresolved: [] };
    const sources = new Set(input.sources);
    const marks = input.thoughts.filter(isMark);
    const place = (thought: ProducedThought) =>
        input.kind === "path" ? Math.max(0, input.sources.indexOf(thought.about ?? "")) : (thought.locator?.at ?? Number.MAX_SAFE_INTEGER);
    const seenMark = new Set<string>();
    const unresolved = marks
        .filter((thought) => !thought.incubated && !seenMark.has(thought.id) && Boolean(seenMark.add(thought.id)))
        .sort((a, b) => place(a) - place(b) || a.at - b.at || compare(a.id, b.id));
    if (input.kind === "path") return { ...empty, unresolved };

    const ideas = new Map<string, ProducedIdea>();
    for (const idea of input.ideas) ideas.set(idea.path, idea);
    const note = (path: string): ProducedNote => ({ path, title: ideas.get(path)?.title || noteName(path) });
    // Something a note of yours can be: in the model, not the source, not a book's note.
    const yours = (path: string) => ideas.has(path) && !sources.has(path) && !input.bookNotes.has(path);

    const bornSet = new Set(input.born.filter((path) => !input.bookNotes.has(path) && !sources.has(path)));
    const born = [...bornSet].map(note).sort(byNote);

    // When you first read it: the first mark you made, or the first note born of it.
    let first = Number.POSITIVE_INFINITY;
    for (const mark of marks) if (mark.at > 0) first = Math.min(first, mark.at);
    for (const path of bornSet) {
        const created = ideas.get(path)?.created ?? 0;
        if (created > 0) first = Math.min(first, created);
    }

    const ideasLed = new Map<string, ProducedNote>();
    const links = new Map<string, ProducedPair>();
    const addLink = (pair: ProducedPair) => {
        const key = `${endKey(pair.a)}→${pair.b.path}`;
        const kept = links.get(key);
        // The same pair, linked and also typed, reads once — by its relation's name.
        if (!kept || (!kept.type && pair.type)) links.set(key, pair);
    };
    for (const path of bornSet) {
        const idea = ideas.get(path);
        if (!idea) continue;
        for (const relation of idea.relations) {
            const to = relation.to;
            if (to === path || bornSet.has(to) || !yours(to)) continue;
            const created = ideas.get(to)?.created ?? 0;
            if (Number.isFinite(first) && created > first) ideasLed.set(to, note(to));
            // A contradiction is a tension, listed there once.
            if (relation.type === CONTRADICTS) continue;
            const type = named(relation.type);
            addLink({ kind: "pair", a: { kind: "note", ...note(path) }, b: note(to), ...(type ? { type } : {}) });
        }
    }
    for (const mark of marks) {
        for (const link of mark.links ?? []) {
            if (bornSet.has(link.to) || !yours(link.to)) continue;
            addLink({ kind: "pair", a: { kind: "highlight", thought: mark }, b: note(link.to) });
        }
    }

    const tensions = new Map<string, ProducedPair | ProducedChallenge>();
    for (const idea of ideas.values()) {
        if (input.bookNotes.has(idea.path) || sources.has(idea.path)) continue;
        for (const relation of idea.relations) {
            if (relation.type !== CONTRADICTS || relation.to === idea.path) continue;
            if (!bornSet.has(idea.path) && !bornSet.has(relation.to)) continue;
            if (!yours(relation.to)) continue;
            tensions.set(`p:${idea.path}→${relation.to}`, { kind: "pair", a: { kind: "note", ...note(idea.path) }, b: note(relation.to), type: CONTRADICTS });
        }
    }
    const markById = new Map(marks.map((mark) => [mark.id, mark]));
    for (const thought of input.thoughts) {
        const answer = thought.respondsTo;
        if (answer?.as !== "challenge") continue;
        const highlight = markById.get(answer.to);
        if (highlight) tensions.set(`c:${thought.id}`, { kind: "challenge", highlight, thought });
    }
    const tensionTitle = (item: ProducedPair | ProducedChallenge) => (item.kind === "pair" ? endTitle(item.a) : (item.highlight.quote?.exact ?? item.highlight.text));
    const tensionKey = (item: ProducedPair | ProducedChallenge) => (item.kind === "pair" ? `${endKey(item.a)}→${item.b.path}` : `c:${item.thought.id}`);

    const questions = new Map<string, ProducedNote>();
    for (const question of input.openQuestions) {
        if (input.bookNotes.has(question.path) || sources.has(question.path)) continue;
        if (question.askedBy.some((asker) => bornSet.has(asker))) questions.set(question.path, note(question.path));
    }

    return {
        born,
        ideas: [...ideasLed.values()].sort(byNote),
        links: [...links.values()].sort(byPair),
        tensions: [...tensions.values()].sort((x, y) => compare(tensionTitle(x), tensionTitle(y)) || compare(tensionKey(x), tensionKey(y))),
        questions: [...questions.values()].sort(byNote),
        unresolved,
    };
}

/** Whether nothing came of it yet (FR-6). */
export function producedNothing(lists: ProducedLists): boolean {
    return PRODUCED_ORDER.every((id) => lists[id].length === 0);
}
