import type { KnowledgeModel } from "../model/KnowledgeModel";
import { namedIn, type Vocabulary } from "./vocabulary";

/**
 * **What is near a passage** (#754 FR-3, AC-1) — decided by the vault, deterministically, with no AI.
 *
 * A note is near the paragraph you are reading (or the words you selected, or the page of a PDF)
 * when:
 * - **a.** its title or an alias is **named** in the passage, as whole words (`vocabulary.ts`);
 * - **b.** it was **born from this book**: its source (#751) is this chapter first, then the rest;
 * - **c.** one of **your marks** in this chapter — a highlight, a margin note — links it or names it;
 * - **d.** in a note reading, it is the chapter's **own note**;
 * - **e.** you **linked it to this passage** (#762): one of its sources cites these very words — the
 *   strongest reason of all after the chapter's own note, because you gave it yourself.
 *
 * Only notes in the model count, and the model holds only the notes in scope (#529): an excluded
 * folder never appears, whatever the caller hands in. Each note is near once, for its strongest
 * reason. Pure and Obsidian-free.
 */

export type NearReason = "named" | "chapter-note" | "linked-here" | "born-chapter" | "born-book" | "mark";

export interface NearItem {
    path: string;
    title: string;
    reason: NearReason;
    /** `p. 143` for a note born from this chapter; the book's title for a mark. */
    detail?: string;
}

/** A note born from the book being read, and where in it (#751): its chapter key and its label. */
export interface BornNote {
    path: string;
    chapterKey?: string;
    label?: string;
    /**
     * Every passage of the book its sources cite (#762): the chapter and the opening words. A passage
     * whose words are in the text Alongside is near makes the note *linked to this passage*.
     */
    places?: readonly { chapterKey?: string; quote: string }[];
}

/**
 * The little of a Think thought Alongside reads (#754): never imported from the thinking layer, so
 * the knowledge layer stays pure — the Reader hands these in.
 */
export interface AlongsideThought {
    id: string;
    /** What you wrote: a margin note, a fleeting thought. */
    text: string;
    /** The note or the source it is about. */
    about?: string;
    /** How the source it is about is called, for *Your highlight in …*. */
    aboutTitle?: string;
    /** The notes its `[[links]]` resolve to. */
    links: readonly { to: string }[];
    /** A highlight of a passage, rather than a thought of your own. */
    highlight: boolean;
    /** What the highlight means (#720): `question`, `idea`… */
    meaning?: string;
    /** How the card names it: the passage, or the thought's first words. */
    title: string;
    /** The file it lives in, so a click can read it. */
    file?: string;
    /**
     * The notes its text names, read once when the thoughts are loaded (`withNamed`) rather than on
     * every settle. Absent: read from `text` when asked.
     */
    named?: readonly string[];
}

export interface NearInput {
    /** The passage: the paragraph at the reading line, the selection, or the page's text. */
    text: string;
    /** The book or paper being read. */
    book?: string;
    bookTitle?: string;
    /** The chapter on screen (#751's key: an EPUB spine path, a PDF's `page:N`). */
    chapterKey?: string;
    born?: readonly BornNote[];
    /** Your highlights and margin notes in this chapter. */
    marks?: readonly AlongsideThought[];
    /** In a note reading, the note on screen. */
    chapterNote?: string;
    /** The notes ruled out for this chapter (*Not related*). */
    ruledOut?: ReadonlySet<string>;
}

/**
 * Read once, when Think's thoughts are loaded, which notes each names — so a settle never reads a
 * thousand thoughts' words again (FR-15). The thoughts themselves are not changed.
 */
export function withNamed(vocabulary: Vocabulary, thoughts: readonly AlongsideThought[]): AlongsideThought[] {
    return thoughts.map((thought) => ({ ...thought, named: namedIn(vocabulary, thought.text) }));
}

/** The notes a thought names: read when it was loaded, or now. */
export function namedBy(vocabulary: Vocabulary, thought: AlongsideThought): readonly string[] {
    return thought.named ?? namedIn(vocabulary, thought.text);
}

const RANK: Record<NearReason, number> = { "chapter-note": -2, "linked-here": -1, named: 0, "born-chapter": 1, "born-book": 2, mark: 5 };

export function nearPassage(model: KnowledgeModel, vocabulary: Vocabulary, input: NearInput): NearItem[] {
    const found = new Map<string, NearItem>();
    const add = (path: string, reason: NearReason, detail?: string) => {
        const idea = model.get(path);
        if (!idea || input.ruledOut?.has(path) || path === input.book) return;
        const held = found.get(path);
        if (held && RANK[held.reason] <= RANK[reason]) return;
        found.set(path, { path, title: idea.title, reason, ...(detail ? { detail } : {}) });
    };

    if (input.chapterNote) add(input.chapterNote, "chapter-note");
    for (const path of namedIn(vocabulary, input.text)) add(path, "named");
    const text = foldText(input.text);
    for (const born of input.born ?? []) {
        const here = Boolean(input.chapterKey) && born.chapterKey === input.chapterKey;
        add(born.path, here ? "born-chapter" : "born-book", here ? born.label : undefined);
        const linked = (born.places ?? []).some((place) => Boolean(input.chapterKey) && place.chapterKey === input.chapterKey && cites(text, place.quote));
        if (linked) add(born.path, "linked-here");
    }
    for (const mark of input.marks ?? []) {
        for (const link of mark.links) add(link.to, "mark", input.bookTitle);
        for (const path of namedBy(vocabulary, mark)) add(path, "mark", input.bookTitle);
    }

    return [...found.values()].sort(byReasonThenTitle);
}

/** Words compared as read: case and whitespace folded. */
function foldText(text: string): string {
    return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Whether the passage holds a cited passage's opening words. */
function cites(text: string, quote: string): boolean {
    const words = foldText(quote);
    return words.length > 0 && text.includes(words);
}

function byReasonThenTitle(a: NearItem, b: NearItem): number {
    return RANK[a.reason] - RANK[b.reason] || a.title.localeCompare(b.title, "en") || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
