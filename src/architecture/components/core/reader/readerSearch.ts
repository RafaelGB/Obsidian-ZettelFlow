/**
 * Search inside a book or a paper (#719, epic #723).
 *
 * Pure: a query against the text of each chapter, as the Reader draws it (`chapterText`), so a
 * match's offsets are the same offsets the chapter's text nodes have and the hit can be drawn with
 * `wrapSpan`. Case and accents are ignored — *informatica* finds *Informática* — and runs of white
 * space match one space, as the page shows them.
 */

/** A folded string, and for each of its characters the offset it came from in the original. */
export interface Folded {
    folded: string;
    map: number[];
}

/** Lower-cased, accents taken off, every run of white space one space — and where each came from. */
export function foldWithMap(text: string): Folded {
    let folded = "";
    const map: number[] = [];
    let inSpace = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (/\s/.test(ch)) {
            if (!inSpace) {
                folded += " ";
                map.push(i);
            }
            inSpace = true;
            continue;
        }
        inSpace = false;
        const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        for (const part of base) {
            folded += part;
            map.push(i);
        }
    }
    return { folded, map };
}

export interface SearchMatch {
    chapter: number;
    /** Offsets in the chapter's own text. */
    start: number;
    end: number;
    /** What surrounds it, for a result to be recognised by. */
    before: string;
    match: string;
    after: string;
}

export interface SearchResult {
    matches: SearchMatch[];
    /** How many chapters hold at least one match. */
    chapters: number;
    /** More matches than were kept. */
    truncated: boolean;
}

/** Shorter than this, a query would match everything and mean nothing. */
const MIN_QUERY = 2;
/** Enough to find anything; more is noise, and a cost on a long book. */
const MAX_MATCHES = 300;
/** Characters of context on each side of a match. */
const CONTEXT = 40;

function foldQuery(query: string): string {
    return foldWithMap(query.trim()).folded;
}

function spansIn(text: string, needle: string, room: number): { start: number; end: number }[] {
    const { folded, map } = foldWithMap(text);
    const spans: { start: number; end: number }[] = [];
    let at = folded.indexOf(needle);
    while (at >= 0 && spans.length < room) {
        const last = at + needle.length - 1;
        spans.push({ start: map[at], end: map[last] + 1 });
        at = folded.indexOf(needle, at + needle.length);
    }
    return spans;
}

/** The spans of one chapter that match — what the chapter on screen tints. */
export function matchesIn(text: string, query: string, limit = MAX_MATCHES): { start: number; end: number }[] {
    const needle = foldQuery(query);
    if (needle.length < MIN_QUERY) return [];
    return spansIn(text, needle, limit);
}

function snippet(text: string, start: number, end: number): Pick<SearchMatch, "before" | "match" | "after"> {
    const flat = (s: string) => s.replace(/\s+/g, " ");
    // At whole words: a snippet that starts mid-word ("…omplexity") is harder to recognise.
    let from = Math.max(0, start - CONTEXT);
    if (from > 0) {
        const space = text.indexOf(" ", from);
        if (space >= 0 && space < start) from = space + 1;
    }
    let to = Math.min(text.length, end + CONTEXT);
    if (to < text.length) {
        const space = text.lastIndexOf(" ", to);
        if (space > end) to = space;
    }
    return {
        before: (from > 0 ? "…" : "") + flat(text.slice(from, start)),
        match: flat(text.slice(start, end)),
        after: flat(text.slice(end, to)) + (to < text.length ? "…" : ""),
    };
}

/** Every match in the book, in reading order, with a snippet each. */
export function searchBook(texts: readonly string[], query: string, limit = MAX_MATCHES): SearchResult {
    const needle = foldQuery(query);
    const matches: SearchMatch[] = [];
    if (needle.length < MIN_QUERY) return { matches, chapters: 0, truncated: false };
    let chapters = 0;
    let truncated = false;
    for (let chapter = 0; chapter < texts.length; chapter++) {
        const text = texts[chapter] ?? "";
        const room = limit - matches.length;
        const spans = spansIn(text, needle, room + 1);
        if (spans.length > 0) chapters++;
        if (spans.length > room) truncated = true;
        for (const span of spans.slice(0, room)) matches.push({ chapter, ...span, ...snippet(text, span.start, span.end) });
        if (matches.length >= limit) {
            truncated = truncated || chapter < texts.length - 1;
            break;
        }
    }
    return { matches, chapters, truncated };
}
