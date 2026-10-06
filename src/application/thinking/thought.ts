/**
 * A thought (#466, epic #465) — pure.
 *
 * Every object ZettelFlow has presupposes the thinking already happened. A note wants a title and
 * acquires a lifecycle state; a relation is a judgement already made; a claim has a source. There
 * was nothing for *"I don't know what I'm thinking yet"* — and writing that as a note made it an
 * orphan, put it in Health, and added to your debt. The system asked you to be finished before
 * you had started.
 *
 * A thought asks for **nothing**: no title, no state, no structure, no correctness. It can be
 * three words, a contradiction, or wrong on purpose. The only things it carries are when it was
 * written, what it says, and — optionally — that it came from another thought or argues with one.
 *
 * It is a **file in your vault**, in a folder the system has agreed not to judge, so you can open
 * it, search it and sync it with your own tools. The text is the body, so what Obsidian shows you
 * is exactly what you typed.
 */

import type { Incubation } from "./incubation";
import type { TextQuote } from "./quoteAnchor";

/** The frontmatter key a thought's little structure lives under. */
export const LAB_FRONTMATTER_KEY = "zfThought";

/** A plain, untyped connection between two thoughts. It never becomes a semantic relation. */
export interface ThoughtLink {
    to: string;
}

/**
 * What a thought is **to the one it came out of**.
 *
 * Fork and challenge were two fields saying the same thing — *which thought is this a response
 * to* — and storing them apart made them impossible to lay out together. They are one relation
 * with two flavours: a variant that goes its own way, or an argument against.
 */
export type ResponseKind = "fork" | "challenge";

export interface Response {
    to: string;
    as: ResponseKind;
}

/**
 * The passage a thought was written **in the margin of** (#671): a highlight made while reading.
 * The words and a little context around them, so the Reader can find the same words again in the
 * note — which it never writes to — and the heading they sat under, when there was one.
 */
export interface ThoughtQuote extends TextQuote {
    heading?: string;
}

/**
 * **Where in a source** a thought was written (#681, epic #675): the chapter of a PDF or an EPUB the
 * Reader had open — a page, or a spine item — by its place, and as a reader would cite it (`p. 42`,
 * `Ch. 3 · The lazy controller`). A note is one file and needs none; a book is hundreds of pages,
 * and a passage is found again only on its own page.
 */
export interface ThoughtLocator {
    /** The chapter's place in the source, from 0. */
    at: number;
    /** How a reader cites it. */
    label: string;
}

/**
 * Where a highlight stands in its review (#678, epic #674): which of the fixed intervals it is on,
 * when it comes back, when you last looked, and whether you let it go. Absent until the first look
 * — a highlight with no review is due a few days after it was made.
 */
export interface ThoughtReview {
    stage: number;
    due: number;
    last?: number;
    retired?: boolean;
}

export interface Thought {
    id: string;
    /** Unix ms. The only ordering a thought has. */
    at: number;
    text: string;
    links: ThoughtLink[];
    /**
     * The thought this one responds to, and how. **At most one** — that single parent is what
     * makes the lab a set of threads you can read downward instead of a pile sorted by clock.
     * Neither side of a challenge is marked right.
     */
    respondsTo?: Response;
    /**
     * The note this thread is **about** (#473), when you arrived here from one. A subject, not a
     * link: the thought is still not knowledge, and crossing over writes nothing to the note.
     * Inherited by every response, so a thread keeps the context you came with.
     */
    about?: string;
    /**
     * The **second** note this thought is about (#567), when it came out of a collision.
     *
     * A separate field rather than widening `about` to a list: `about` is read by six places (the
     * Lab's banner, the subject row, crystallize's consensus, the timeline strand) and each of them
     * means *the one note this thread came from*. Widening it would retype all six to serve one
     * feature; this adds one clause to each of the three that need to see both.
     */
    alsoAbout?: string;
    /** Set aside (#469). Absent is the normal state, and it generates nothing. */
    incubated?: Incubation;
    /**
     * The passage of `about` this thought was written beside (#671), when it is a highlight. The
     * text of the thought is then the margin note — and may be empty: a highlight alone is a mark.
     */
    quote?: ThoughtQuote;
    /** A highlight's review (#678). Written by the review cards and nowhere else. */
    review?: ThoughtReview;
    /**
     * The highlight this thought **changed your mind** about (#679): its id and the passage, so the
     * pair — what you marked then, what you think now — can be told without opening the old file.
     * The thought also responds to the highlight as a challenge, which is what threads it in Think.
     */
    revises?: ThoughtRevision;
    /**
     * Where in a source `about` is (#681): set on a highlight made in a PDF or an EPUB, and on a
     * note written in the margin of a page that has no text to highlight.
     */
    locator?: ThoughtLocator;
}

/** What a *changed my mind* thought points back at (#679). */
export interface ThoughtRevision {
    of: string;
    quote: string;
}

/** Whether a thought is a highlight made in the Reader. */
export function isHighlight(thought: Pick<Thought, "quote" | "about">): boolean {
    return Boolean(thought.quote?.exact && thought.about);
}

export interface NewThought {
    text: string;
    id: string;
    at: number;
    respondsTo?: Response;
    about?: string;
    alsoAbout?: string;
    quote?: ThoughtQuote;
    revises?: ThoughtRevision;
    locator?: ThoughtLocator;
}

export function newThought(input: NewThought): Thought {
    return {
        id: input.id,
        at: input.at,
        text: input.text,
        links: [],
        ...(input.respondsTo ? { respondsTo: input.respondsTo } : {}),
        ...(input.about ? { about: input.about } : {}),
        ...(input.alsoAbout ? { alsoAbout: input.alsoAbout } : {}),
        ...(input.quote?.exact ? { quote: input.quote } : {}),
        ...(input.revises?.of ? { revises: input.revises } : {}),
        ...(input.locator ? { locator: input.locator } : {}),
    };
}

/**
 * Connect two thoughts, both ways. Neither becomes the other's parent — a connection between two
 * half-formed things has no direction worth recording.
 */
export function linkThoughts(left: Thought, right: Thought): [Thought, Thought] {
    const add = (thought: Thought, other: string): Thought =>
        thought.links.some((link) => link.to === other)
            ? thought
            : { ...thought, links: [...thought.links, { to: other }] };
    return [add(left, right.id), add(right, left.id)];
}

/** Newest first: where you were just working is where you want to be. */
export function orderThoughts(thoughts: readonly Thought[]): Thought[] {
    return [...thoughts].sort((a, b) => b.at - a.at);
}

/** Where a thought's file goes. Named after its id and time, never after a title it does not have. */
export function thoughtPath(folder: string, thought: Thought): string {
    return `${folder}/${thought.at}-${thought.id}.md`;
}

/**
 * The file a thought is.
 *
 * The text is the **body**, not a frontmatter field, so opening it in Obsidian shows what you
 * wrote and nothing else. The structure is minimal and is serialised by hand rather than through
 * a YAML library, because what it holds is three ids and a list of ids.
 */
export function renderThought(thought: Thought): string {
    const lines = [
        "---",
        `${LAB_FRONTMATTER_KEY}:`,
        `  id: ${thought.id}`,
        `  at: ${thought.at}`,
        `  links: [${thought.links.map((link) => link.to).join(", ")}]`,
    ];
    if (thought.respondsTo) {
        lines.push(`  respondsTo: ${thought.respondsTo.to}`, `  respondsAs: ${thought.respondsTo.as}`);
    }
    if (thought.about) lines.push(`  about: ${thought.about}`);
    if (thought.alsoAbout) lines.push(`  alsoAbout: ${thought.alsoAbout}`);
    if (thought.incubated) {
        lines.push(`  asideReason: ${thought.incubated.reason}`, `  asideAt: ${thought.incubated.at}`);
        if (thought.incubated.stuckOn) lines.push(`  stuckOn: ${thought.incubated.stuckOn}`);
    }
    if (thought.quote?.exact) {
        // A passage is prose — colons, quotes, a stray `#` — so it is written as a JSON string,
        // which YAML reads as an ordinary double-quoted scalar (and Obsidian's cache with it).
        lines.push(`  quoteExact: ${JSON.stringify(thought.quote.exact)}`);
        lines.push(`  quotePrefix: ${JSON.stringify(thought.quote.prefix)}`);
        lines.push(`  quoteSuffix: ${JSON.stringify(thought.quote.suffix)}`);
        if (thought.quote.heading) lines.push(`  quoteHeading: ${JSON.stringify(thought.quote.heading)}`);
    }
    if (thought.review) {
        lines.push(`  reviewStage: ${thought.review.stage}`, `  reviewDue: ${thought.review.due}`);
        if (thought.review.last) lines.push(`  reviewedAt: ${thought.review.last}`);
        if (thought.review.retired) lines.push("  reviewRetired: true");
    }
    if (thought.revises?.of) {
        lines.push(`  revisesOf: ${thought.revises.of}`, `  revisesQuote: ${JSON.stringify(thought.revises.quote)}`);
    }
    if (thought.locator) {
        lines.push(`  locatorAt: ${thought.locator.at}`, `  locatorLabel: ${JSON.stringify(thought.locator.label)}`);
    }
    lines.push("---", "", thought.text.replace(/\n+$/, ""), "");
    return lines.join("\n");
}

/**
 * Read a thought back.
 *
 * Anything it cannot understand becomes **just text**, never an error: someone will write a note
 * in this folder by hand, and that is allowed — it is a thought. A refuge that rejects what you
 * put in it is not one.
 */
export function parseThought(content: string, path: string): Thought {
    const fallbackId = path;
    const match = /^---\n([\s\S]*?)\n---\n?/.exec(content);
    if (!match) {
        return { id: fallbackId, at: 0, text: content.trim(), links: [] };
    }
    // Exactly one leading newline: the blank line between frontmatter and body is Obsidian's
    // convention and ours, so it belongs to the format, not to what you wrote.
    const body = content.slice(match[0].length).replace(/^\n/, "").replace(/\n+$/, "");
    const head = match[1];
    const read = (field: string): string | undefined =>
        new RegExp(`^\\s{2}${field}:\\s*(.*)$`, "m").exec(head)?.[1]?.trim();

    const rawLinks = read("links") ?? "";
    const links = rawLinks
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((to) => ({ to }));

    const at = Number(read("at"));
    const respondsTo = readResponse(read);
    const quote = readQuote(read);
    const review = readReview(read);
    const locator = readLocator(read);
    const revisesOf = read("revisesOf");
    const revises: ThoughtRevision | undefined = revisesOf
        ? { of: revisesOf, quote: readString(read("revisesQuote")) ?? "" }
        : undefined;
    const about = read("about");
    const alsoAbout = read("alsoAbout");
    const asideReason = read("asideReason");
    const stuckOn = read("stuckOn");
    const incubated: Incubation | undefined =
        asideReason === "not-now" || asideReason === "decided-against" || asideReason === "crystallized"
            ? {
                  reason: asideReason,
                  at: Number(read("asideAt")) || 0,
                  ...(stuckOn ? { stuckOn } : {}),
              }
            : undefined;
    return {
        id: read("id") || fallbackId,
        at: Number.isFinite(at) ? at : 0,
        text: body,
        links,
        ...(respondsTo ? { respondsTo } : {}),
        ...(about ? { about } : {}),
        ...(alsoAbout ? { alsoAbout } : {}),
        ...(incubated ? { incubated } : {}),
        ...(quote ? { quote } : {}),
        ...(review ? { review } : {}),
        ...(revises ? { revises } : {}),
        ...(locator ? { locator } : {}),
    };
}

/** Where in a source a thought was written (#681), when the file says. */
function readLocator(read: (field: string) => string | undefined): ThoughtLocator | undefined {
    const raw = read("locatorAt");
    const at = Number(raw);
    if (raw === undefined || !Number.isInteger(at) || at < 0) return undefined;
    return { at, label: readString(read("locatorLabel")) ?? "" };
}

/** A highlight's review (#678), when the file carries one. A garbled one is no review at all. */
function readReview(read: (field: string) => string | undefined): ThoughtReview | undefined {
    const stage = Number(read("reviewStage"));
    const due = Number(read("reviewDue"));
    if (!Number.isInteger(stage) || stage < 0 || !Number.isFinite(due)) return undefined;
    const last = Number(read("reviewedAt"));
    return {
        stage,
        due,
        ...(Number.isFinite(last) && last > 0 ? { last } : {}),
        ...(read("reviewRetired") === "true" ? { retired: true } : {}),
    };
}

/** A string field written as JSON; anything else is taken as it stands. */
function readString(raw: string | undefined): string | undefined {
    if (raw === undefined) return undefined;
    if (raw.startsWith("\"")) {
        try {
            const parsed: unknown = JSON.parse(raw);
            return typeof parsed === "string" ? parsed : raw;
        } catch {
            return raw;
        }
    }
    return raw;
}

/** The passage a highlight was made on (#671), when the file carries one. */
function readQuote(read: (field: string) => string | undefined): ThoughtQuote | undefined {
    const exact = readString(read("quoteExact"));
    if (!exact) return undefined;
    const heading = readString(read("quoteHeading"));
    return {
        exact,
        prefix: readString(read("quotePrefix")) ?? "",
        suffix: readString(read("quoteSuffix")) ?? "",
        ...(heading ? { heading } : {}),
    };
}

/**
 * The response a file declares.
 *
 * Also reads the two fields this replaced (`forkedFrom` / `challenges`), so a lab written by an
 * earlier build keeps its threads. A read-only migration: the next save writes the new shape, and
 * the old keys are never produced again.
 */
function readResponse(read: (field: string) => string | undefined): Response | undefined {
    const to = read("respondsTo");
    const as = read("respondsAs");
    if (to && (as === "fork" || as === "challenge")) return { to, as };

    const forked = read("forkedFrom");
    if (forked) return { to: forked, as: "fork" };
    const challenged = read("challenges");
    if (challenged) return { to: challenged, as: "challenge" };
    return undefined;
}
