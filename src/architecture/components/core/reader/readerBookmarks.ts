import { anchorQuote, quoteAt, type TextQuote } from "application/thinking/quoteAnchor";

/**
 * **A bookmark is a place, not a thought** (#761, epic #739; FR-1–FR-5). Pure.
 *
 * A bookmark keeps the chapter (a PDF's page, an EPUB's spine item) and where in its text the first
 * line on screen began — a character offset into the chapter's text, plus the words found there, the
 * same text-quote anchor a highlight keeps. So it is found again **by its words**, whatever the font,
 * the size, the layout or the device (FR-3), and the offset is only the fallback. In a PDF's Page view
 * a bookmark is its page: offset 0, no words.
 *
 * Kept in plugin data beside the book's place (`SourceMeta.bookmarks`), never in Think, never in a
 * note, never in the book's file (FR-2).
 */

export interface Bookmark {
    /** The chapter: a PDF's page, an EPUB's spine item. */
    chapter: number;
    /** Where the place begins in the chapter's text (`chapterText`). */
    offset: number;
    /** The words there, to find the same line after any change of type (FR-3). */
    quote?: TextQuote;
    /** When it was made. */
    at: number;
}

/** How many bookmarks a book keeps: plugin data stays small. The oldest goes first. */
export const BOOKMARKS_PER_BOOK = 200;

/** How many characters of the line a bookmark keeps, and lists (FR-4). */
export const BOOKMARK_CHARS = 80;

/**
 * The start of the word `offset` falls in: the first line on screen is asked at a point a few pixels
 * in, which can be just past a narrow first letter.
 */
export function wordStart(text: string, offset: number): number {
    const at = Math.max(0, Math.min(Math.round(offset), text.length));
    if (at === 0 || /\s/.test(text[at - 1])) return at;
    // A few letters back at most: a block that starts with no space before it is left where it starts.
    for (let back = 1; back <= WORD_SNAP && at - back >= 0; back++) {
        if (at - back === 0 || /\s/.test(text[at - back - 1])) return at - back;
    }
    return at;
}

/** How far back a place may move to the start of its word. */
const WORD_SNAP = 3;

/** A bookmark at `offset` of a chapter whose text is `text` — with its words, when there are any. */
export function bookmarkAt(text: string, chapter: number, offset: number, at: number): Bookmark {
    const from = wordStart(text, offset);
    const found = quoteAt(text, from, from + BOOKMARK_CHARS);
    if (!found) return { chapter, offset: from, at };
    return { chapter, offset: found.span.start, quote: found.quote, at };
}

/** Chapter, then place in it: the order a book is read in. */
export function inReadingOrder(list: readonly Bookmark[]): Bookmark[] {
    return [...list].sort((a, b) => a.chapter - b.chapter || a.offset - b.offset || a.at - b.at);
}

const same = (a: Bookmark, b: Bookmark) => a.chapter === b.chapter && a.offset === b.offset;

/** Keep `bookmark`: one per place, in reading order, the oldest forgotten past the cap. */
export function addBookmark(list: readonly Bookmark[], bookmark: Bookmark, limit = BOOKMARKS_PER_BOOK): Bookmark[] {
    let next = [...list.filter((b) => !same(b, bookmark)), bookmark];
    if (next.length > limit) {
        const oldest = [...next].sort((a, b) => a.at - b.at).slice(0, next.length - limit);
        next = next.filter((b) => !oldest.includes(b));
    }
    return inReadingOrder(next);
}

/** Every bookmark but these. */
export function removeBookmarks(list: readonly Bookmark[], gone: readonly Bookmark[]): Bookmark[] {
    return list.filter((b) => !gone.some((g) => same(g, b) && g.at === b.at));
}

/** The bookmarks of `chapter` whose place is in `[start, end)` of its text. */
export function bookmarksIn(list: readonly Bookmark[], chapter: number, start: number, end: number): Bookmark[] {
    return list.filter((b) => b.chapter === chapter && b.offset >= start && b.offset < end);
}

/** Where a bookmark lands in the chapter's text as it is now: by its words, else by its offset. */
export function landingOffset(text: string, bookmark: Bookmark): number {
    // A refrain the book repeats is the one nearest where the bookmark was made.
    const span = bookmark.quote ? anchorQuote(text, bookmark.quote, bookmark.offset) : null;
    if (span) return span.start;
    return Math.max(0, Math.min(bookmark.offset, text.length));
}

/** The first words of the line, as the list shows them (FR-4). */
export function bookmarkSnippet(bookmark: Bookmark): string {
    return (bookmark.quote?.exact ?? "").replace(/\s+/g, " ").trim();
}

const whole = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const str = (value: unknown): value is string => typeof value === "string";

/** Read a stored list, keeping only well-formed bookmarks, in reading order. Never throws. */
export function normalizeBookmarks(raw: unknown): Bookmark[] {
    if (!Array.isArray(raw)) return [];
    const out: Bookmark[] = [];
    for (const value of raw) {
        const v = value as Record<string, unknown> | null;
        if (!v || typeof v !== "object" || !whole(v.chapter) || !whole(v.offset) || !whole(v.at) || v.at === 0) continue;
        const bookmark: Bookmark = { chapter: Math.round(v.chapter), offset: Math.round(v.offset), at: v.at };
        const q = v.quote as Record<string, unknown> | undefined;
        if (q && typeof q === "object" && str(q.exact) && q.exact.trim() && str(q.prefix) && str(q.suffix)) {
            bookmark.quote = { exact: q.exact.slice(0, BOOKMARK_CHARS), prefix: q.prefix, suffix: q.suffix };
        }
        out.push(bookmark);
    }
    return inReadingOrder(out).slice(0, BOOKMARKS_PER_BOOK);
}
