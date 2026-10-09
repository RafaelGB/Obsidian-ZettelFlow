import type { TextQuote } from "application/thinking/quoteAnchor";
import { isHighlight, type Thought } from "application/thinking/thought";
import { titleFromName } from "./shelf";
import { sourceFormat } from "./sourceMeta";

/**
 * **Exact provenance: every note from a book goes back to its paragraph** (#751, epic #741) — pure.
 *
 * A passage of a PDF or an EPUB is found again by **where its chapter is in the file plus a short
 * quote** — the W3C *TextQuoteSelector* a highlight already keeps (`quoteAnchor.ts`). Not an EPUB
 * CFI: a CFI counts element steps in the book's original XHTML, the Reader draws a sanitised copy of
 * it, and a coordinate the Reader cannot check itself would break silently.
 *
 * This module is the **one producer** (`sourceEntry`) and the **one reader** (`readSourceEntry`) of
 * the written form, and of the passage link (`passageLink` / `parsePassageLink`). Every later slice
 * that cites a passage — a claim, a link to an idea, a tension, a move, R4's citations — goes
 * through it.
 *
 * The written form is one string in the note's `source` list property, which still reads as a
 * citation when the plugin is gone:
 *
 * ```
 * [[Books/Thinking, Fast and Slow.epub#OEBPS/ch03.xhtml|Thinking, Fast and Slow]] p. 143 · 3 · The lazy controller · “…physical exertion. ‹A general law of least effort applies› to cognitive…”
 * [[Papers/cap.pdf#page=6|Cap]] p. 6 · “…‹Partitions are rare› but…”
 * ```
 *
 * - the chapter's identity rides in the link's subpath: the spine item's own path for an EPUB, and
 *   Obsidian's own `#page=N` for a PDF (so the link opens the right page in Obsidian's viewer too);
 * - the print page, only when the source declares one (`p. N`) — never invented (FR-3);
 * - the chapter as the book names it (an EPUB's; a PDF's chapter *is* its page);
 * - the opening words of the passage between `‹ ›`, inside a few words of context.
 *
 * `stripWikilink` drops the subpath and alias, so the claim parser still counts the note as sourced
 * by the book (#148), and `citedLocator` still parses `[[x#…|…]] locator` (3.6's *Born from*).
 */

/** A place in a source: the file, its chapter, and the opening words of the passage. */
export interface PassagePlace {
    /** The vault path of the PDF or the EPUB. */
    file: string;
    /**
     * The chapter's identity inside the file: an EPUB spine item's own path (`OEBPS/ch03.xhtml`), a
     * PDF's page index from 0 (`page:5`). Absent in a citation written before #751.
     */
    chapter?: string;
    /** How the book names the chapter: `3 · The lazy controller`, `p. 42`. */
    label: string;
    /** The print page label, only when the source declares one (FR-3). */
    page?: string;
    /** The passage's opening words, bounded (`boundQuote`). Absent: the chapter is the place. */
    quote?: TextQuote;
    /** How the entry names the source (its link's alias): the title the file declares; its name if absent. */
    title?: string;
}

/** Where a declared print page begins in a chapter's text (`chapterText`). */
export interface PageMark {
    label: string;
    offset: number;
}

/** The passage's opening words: at most this many words… */
export const PLACE_WORDS = 12;
/** …and this many characters. */
export const PLACE_CHARS = 90;
/** Context kept on each side of the opening words. */
export const PLACE_CONTEXT = 24;

/** The bounds a passage link's values must keep (AC-7). */
export const LINK_CAPS = { file: 1024, chapter: 512, page: 32, label: 200, q: PLACE_CHARS, pre: PLACE_CONTEXT, suf: PLACE_CONTEXT } as const;

/** The URI action a passage link opens: `obsidian://zettelflow-read?…`. */
export const PASSAGE_ACTION = "zettelflow-read";

const PDF_KEY = /^page:(\d{1,6})$/;

/**
 * The characters the written form uses for itself, folded to an ASCII look-alike in the book's
 * text — one character for one, so an offset in the folded text is an offset in the text.
 */
const MARKS: Record<string, string> = { "‹": "<", "›": ">", "[": "(", "]": ")", "|": "/", "“": '"', "”": '"' };

/** The text with the written form's own characters folded (one for one: offsets are kept). */
export function foldMarks(text: string): string {
    return text.replace(/[‹›[\]|“”]/g, (ch) => MARKS[ch] ?? ch);
}

function folded(text: string): string {
    return foldMarks(text.replace(/\s+/g, " "));
}

/** The first `max` characters of `text`, cut back to a word boundary when one is there. */
function cutForward(text: string, max: number): string {
    if (text.length <= max) return text;
    const head = text.slice(0, max);
    if (text[max] === " ") return head;
    const space = head.lastIndexOf(" ");
    return space > 0 ? head.slice(0, space) : head;
}

/** The last `max` characters of `text`, cut forward to a word boundary when one is there. */
function cutBack(text: string, max: number): string {
    if (text.length <= max) return text;
    const tail = text.slice(text.length - max);
    if (text[text.length - max - 1] === " ") return tail;
    const space = tail.indexOf(" ");
    return space >= 0 && space < tail.length - 1 ? tail.slice(space + 1) : tail;
}

/**
 * A passage's quote, bounded so the properties stay readable (FR-2): its opening words (≤ 12 words,
 * ≤ 90 characters, cut on a word boundary) and ≤ 24 characters of context each side. What follows
 * the opening words is the passage's own rest, so the suffix still sits right after them.
 */
export function boundQuote(quote: TextQuote): TextQuote {
    const whole = folded(quote.exact).trim();
    const words = whole.split(" ").filter(Boolean);
    let exact = "";
    let count = 0;
    for (const word of words) {
        const next = exact ? `${exact} ${word}` : word;
        if (count >= PLACE_WORDS || next.length > PLACE_CHARS) break;
        exact = next;
        count++;
    }
    if (!exact) exact = whole.slice(0, PLACE_CHARS);
    // What follows the opening words: the rest of the passage, then what came after it.
    const after = whole.slice(exact.length) + folded(quote.suffix);
    return { exact, prefix: cutBack(folded(quote.prefix), PLACE_CONTEXT), suffix: cutForward(after, PLACE_CONTEXT) };
}

/** The place a highlight of a PDF or an EPUB was made at (FR-5). `null` for anything else. */
export function placeOf(thought: Thought): PassagePlace | null {
    if (!isHighlight(thought) || !thought.about || !thought.locator) return null;
    const format = sourceFormat(thought.about);
    if (!format || !thought.quote?.exact?.trim()) return null;
    const locator = thought.locator;
    const chapter = locator.chapter ?? (format === "pdf" ? `page:${locator.at}` : undefined);
    return {
        file: thought.about,
        ...(chapter ? { chapter } : {}),
        label: locator.label,
        ...(locator.page ? { page: locator.page } : {}),
        quote: boundQuote(thought.quote),
    };
}

/** Two places of the same passage: the same file, chapter and opening words (whitespace folded). */
export function samePlace(a: PassagePlace, b: PassagePlace): boolean {
    const words = (p: PassagePlace) => folded(p.quote?.exact ?? "").trim();
    return a.file === b.file && (a.chapter ?? "") === (b.chapter ?? "") && words(a) === words(b);
}

// ── the written form ────────────────────────────────────────────────────────

/** A spine href made safe in a link's subpath: `%`, `#`, `|`, `[`, `]` and `^` percent-encoded. */
function encodeKey(key: string): string {
    return key.replace(/[%#|[\]^]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
}

function decodeKey(sub: string): string {
    try {
        return decodeURIComponent(sub);
    } catch {
        return sub;
    }
}

/** How the entry names the source when it is not told: its file's name. */
export function sourceTitle(file: string): string {
    return titleFromName(file.split("/").pop() ?? file);
}

/**
 * **The one producer of the written form** (FR-1, FR-9): the citation a note keeps in its `source`
 * list. `title` is the link's alias; the file's name when absent.
 */
export function sourceEntry(place: PassagePlace, title = place.title ?? sourceTitle(place.file)): string {
    const pdf = sourceFormat(place.file) === "pdf";
    const index = pdf && place.chapter ? PDF_KEY.exec(place.chapter) : null;
    const sub = pdf ? (index ? `page=${Number(index[1]) + 1}` : "") : place.chapter ? encodeKey(place.chapter) : "";
    const alias = folded(title).trim();
    let entry = `[[${place.file}${sub ? `#${sub}` : ""}${alias ? `|${alias}` : ""}]]`;
    if (place.page) entry += ` p. ${folded(place.page).trim()}`;
    const parts = [entry];
    const label = folded(place.label).trim();
    // A PDF's chapter is its page: its label says nothing the page does not.
    if (label && !pdf) parts.push(label);
    if (place.quote?.exact.trim()) {
        const q = place.quote;
        const prefix = folded(q.prefix);
        const suffix = folded(q.suffix);
        parts.push(`“${prefix ? `…${prefix}` : ""}‹${folded(q.exact).trim()}›${suffix ? `${suffix}…` : ""}”`);
    }
    return parts.join(" · ");
}

const ENTRY = /^\s*\[\[([^\]|#]+)(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]\s*(.*)$/;

/** The quote between `“ ”`: its context and its `‹opening words›`. */
function readQuote(text: string): TextQuote | undefined {
    const open = text.indexOf("‹");
    const close = text.lastIndexOf("›");
    if (open < 0 || close < open) return undefined;
    const exact = text.slice(open + 1, close).trim();
    if (!exact) return undefined;
    let prefix = text.slice(0, open);
    let suffix = text.slice(close + 1);
    if (prefix.startsWith("…")) prefix = prefix.slice(1);
    if (suffix.endsWith("…")) suffix = suffix.slice(0, -1);
    return { exact, prefix, suffix };
}

/**
 * **The one reader of the written form** (FR-9): a `source` value back to its place. A citation
 * written before #751 (`[[x.epub]] 3 · Title`, `[[x.pdf]] p. 42`) reads as a place with no chapter
 * and no quote. Anything that cites no PDF or EPUB, or is not a string, is `null`. Never throws.
 */
export function readSourceEntry(value: unknown): PassagePlace | null {
    if (typeof value !== "string") return null;
    try {
        const match = ENTRY.exec(value.trim());
        if (!match) return null;
        const file = match[1].trim();
        const format = sourceFormat(file);
        if (!format) return null;
        const sub = match[2]?.trim() ?? "";
        const title = match[3]?.trim();
        let tail = match[4].trim();
        let quote: TextQuote | undefined;
        const open = tail.indexOf("“");
        if (open >= 0 && tail.endsWith("”")) {
            quote = readQuote(tail.slice(open + 1, -1));
            tail = tail.slice(0, open).trim().replace(/·$/, "").trim();
        }
        // Between the link and the label: ` p. N`, or a bare ` · ` for a book with no print pages.
        tail = tail.replace(/^·\s*/, "");
        let page: string | undefined;
        let label = tail;
        const paged = /^p\.\s*(\S[^·]*?)(?:\s+·\s+(.*))?$/.exec(tail);
        if (paged) {
            page = paged[1].trim();
            label = (paged[2] ?? "").trim();
        }
        let chapter: string | undefined;
        if (format === "pdf") {
            const n = /^page=(\d{1,6})$/.exec(sub);
            if (n && Number(n[1]) >= 1) chapter = `page:${Number(n[1]) - 1}`;
            if (!label && page) label = `p. ${page}`;
        } else if (sub) {
            chapter = decodeKey(sub);
        }
        return {
            file,
            ...(chapter ? { chapter } : {}),
            label,
            ...(page ? { page } : {}),
            ...(quote ? { quote } : {}),
            ...(title ? { title } : {}),
        };
    } catch {
        return null;
    }
}

/** How a place reads in a row: its page when it has one, else its chapter. */
export function placeLabel(place: PassagePlace): string {
    return place.page ? `p. ${place.page}` : place.label;
}

// ── print pages (FR-3) ──────────────────────────────────────────────────────

/** The print page a passage at `offset` is on: the last declared mark at or before it. */
export function printPageAt(marks: readonly PageMark[] | undefined, offset: number): string | undefined {
    let found: string | undefined;
    for (const mark of marks ?? []) if (mark.offset <= offset) found = mark.label;
    return found;
}

// ── finding the chapter again (AC-4) ───────────────────────────────────────

/** What a chapter tells a place apart by. */
export interface PlaceChapter {
    label: string;
    /** The chapter's identity: a spine href, `page:i` (P1). */
    key?: string;
    /** A PDF page's print label. */
    page?: string;
}

function normal(label: string): string {
    return label.replace(/[[\]|]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function afterDot(label: string): string {
    const at = label.indexOf("·");
    return at >= 0 ? label.slice(at + 1).trim() : "";
}

function leadingNumber(label: string): string | null {
    return /^(\d+)\b/.exec(label)?.[1] ?? null;
}

/**
 * The chapter an old citation names by its label (`3 · The lazy controller`): the whole label, then
 * its title after `·`, then its number — the number **the book labels** the chapter with, never a
 * spine index (G1). `null` when none matches.
 */
export function chapterFromLabel(label: string, chapters: readonly PlaceChapter[]): number | null {
    const want = normal(label);
    if (!want) return null;
    const whole = chapters.findIndex((ch) => normal(ch.label) === want);
    if (whole >= 0) return whole;
    const title = normal(afterDot(label)) || want;
    if (title) {
        const byTitle = chapters.findIndex((ch) => normal(afterDot(ch.label)) === title || normal(ch.label) === title);
        if (byTitle >= 0) return byTitle;
    }
    const number = leadingNumber(want);
    if (number) {
        const byNumber = chapters.findIndex((ch) => leadingNumber(normal(ch.label)) === number);
        if (byNumber >= 0) return byNumber;
    }
    return null;
}

/**
 * The chapter a place is in (AC-4): by its key, so a reordered spine still lands; then by the label
 * the book gave it; then by its page. `null` when the source has no such chapter.
 */
export function resolveChapter(place: PassagePlace, chapters: readonly PlaceChapter[]): number | null {
    if (place.chapter) {
        const byKey = chapters.findIndex((ch) => ch.key === place.chapter);
        if (byKey >= 0) return byKey;
    }
    const byLabel = place.label ? chapterFromLabel(place.label, chapters) : null;
    if (byLabel !== null) return byLabel;
    if (place.page) {
        const byPage = chapters.findIndex((ch) => ch.page === place.page);
        if (byPage >= 0) return byPage;
        const n = /^\d{1,6}$/.test(place.page) ? Number(place.page) - 1 : -1;
        if (sourceFormat(place.file) === "pdf" && n >= 0 && n < chapters.length) return n;
    }
    return null;
}

// ── a place in the Reader's state, and a link to it (FR-8) ──────────────────

function paramsOf(place: PassagePlace, withLabel: boolean): [string, string][] {
    const out: [string, string][] = [["file", place.file]];
    if (place.chapter) out.push(["chapter", place.chapter]);
    if (withLabel && place.label) out.push(["label", place.label]);
    if (place.page) out.push(["page", place.page]);
    if (place.quote) {
        out.push(["q", place.quote.exact]);
        if (place.quote.prefix) out.push(["pre", place.quote.prefix]);
        if (place.quote.suffix) out.push(["suf", place.quote.suffix]);
    }
    return out;
}

const query = (pairs: [string, string][]) => pairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");

/** A place, as the Reader's one-shot view state carries it (`ReaderState.at`). */
export function serializePlace(place: PassagePlace): string {
    return query(paramsOf(place, true));
}

function decodePairs(text: string): Map<string, string> | null {
    const out = new Map<string, string>();
    for (const pair of text.split("&")) {
        if (!pair) continue;
        const eq = pair.indexOf("=");
        const key = eq >= 0 ? pair.slice(0, eq) : pair;
        if (out.has(key)) return null;
        out.set(key, decodeURIComponent((eq >= 0 ? pair.slice(eq + 1) : "").replace(/\+/g, " ")));
    }
    return out;
}

/** Back from `serializePlace`. `null` for anything that is not a place in a source. Never throws. */
export function parsePlace(text: unknown): PassagePlace | null {
    if (typeof text !== "string" || text.length === 0 || text.length > 4096) return null;
    try {
        const pairs = decodePairs(text);
        if (!pairs) return null;
        const file = pairs.get("file") ?? "";
        if (!sourceFormat(file)) return null;
        const exact = pairs.get("q")?.trim();
        const chapter = pairs.get("chapter");
        const page = pairs.get("page");
        return {
            file,
            ...(chapter ? { chapter } : {}),
            label: pairs.get("label") ?? "",
            ...(page ? { page } : {}),
            ...(exact ? { quote: { exact, prefix: pairs.get("pre") ?? "", suffix: pairs.get("suf") ?? "" } } : {}),
        };
    } catch {
        return null;
    }
}

/**
 * **A link to a passage** (FR-8): `obsidian://zettelflow-read?vault=…&file=…&chapter=…&q=…&pre=…&suf=…[&page=…]`.
 * It carries the path and the anchor's few words, nothing more. A public surface: documented once,
 * in `docs/development/reader.md`.
 */
export function passageLink(place: PassagePlace, vault: string): string {
    return `obsidian://${PASSAGE_ACTION}?${query([["vault", vault], ...paramsOf(place, false)])}`;
}

const LINK_KEYS = new Set(["action", "vault", "file", "chapter", "q", "pre", "suf", "page"]);

/**
 * Back from a passage link's parameters (as Obsidian hands them to a protocol handler). `null` —
 * open nothing — for a file that is not a PDF or an EPUB, a value over its cap, a missing required
 * field (`file`, `chapter`, `q`) or a field the link does not know (AC-7). Never throws.
 */
export function parsePassageLink(params: Readonly<Record<string, unknown>>): PassagePlace | null {
    try {
        for (const [key, value] of Object.entries(params)) {
            if (!LINK_KEYS.has(key) || (value !== undefined && typeof value !== "string")) return null;
        }
        const get = (key: string): string | undefined => {
            const value = params[key];
            return typeof value === "string" ? value : undefined;
        };
        const file = get("file");
        const chapter = get("chapter");
        const exact = get("q")?.trim();
        if (!file || !chapter || !exact || !sourceFormat(file)) return null;
        const over = (key: keyof typeof LINK_CAPS, value: string | undefined) => value !== undefined && value.length > LINK_CAPS[key];
        const pre = get("pre") ?? "";
        const suf = get("suf") ?? "";
        const page = get("page");
        if (over("file", file) || over("chapter", chapter) || over("q", exact) || over("pre", pre) || over("suf", suf) || over("page", page)) return null;
        return { file, chapter, label: "", ...(page ? { page } : {}), quote: { exact, prefix: pre, suffix: suf } };
    } catch {
        return null;
    }
}

/**
 * The note's `source` value with `entries` added (#751 P7): a scalar becomes a list, and an entry is
 * added once — not again when the same passage (`samePlace`), or the same text, is already there.
 * `null` when nothing would change. Whatever else the value held is kept as it was.
 */
export function mergeSourceEntries(current: unknown, entries: readonly string[]): unknown[] | null {
    const list: unknown[] = Array.isArray(current) ? Array.from(current as unknown[]) : current === undefined || current === null || current === "" ? [] : [current];
    let changed = false;
    for (const entry of entries) {
        const place = readSourceEntry(entry);
        const there = list.some((item) => {
            if (item === entry) return true;
            const other = readSourceEntry(item);
            return Boolean(place && other && place.quote && other.quote && samePlace(place, other));
        });
        if (there) continue;
        list.push(entry);
        changed = true;
    }
    return changed ? list : null;
}
