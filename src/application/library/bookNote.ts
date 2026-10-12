import type { EpubPackage } from "./epubPackage";
import { sourceFormat, type SourceMeta } from "./sourceMeta";

/**
 * **A book's note** (#743, epic #742) — pure.
 *
 * Every book, paper and article on the shelf can have **its own note**: an ordinary Markdown note
 * whose frontmatter holds what the book is (author, series, publisher, year, language, ISBN, tags)
 * and what it is *to you* (a status, its collections). It is created the first time you say
 * something about the book, in the *Book notes folder* — and it is found **by its link to the book**
 * under one key, never by where it is kept, so a renamed book, a moved note or a note left by an
 * earlier folder all still belong to their book.
 *
 * The key is `book`, for a paper too. Not `source`/`sources` (those make a note *born* from the
 * book) and not `file` (Dataview's own).
 */

/** The one frontmatter key that links a book's note to its book. */
export const BOOK_LINK_KEY = "book";

/** The three statuses, stored as these values whatever language the plugin speaks. */
export const BOOK_STATUSES = ["to-read", "reading", "finished"] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

/** The fields a book's note carries, in the order they are written. */
export const BOOK_FIELDS = ["title", "author", "series", "publisher", "year", "language", "isbn", "citekey", "tags", "status", "collections"] as const;
export type BookField = (typeof BOOK_FIELDS)[number];

/** The fields the Details section edits as text, in the order it shows them. */
export const TEXT_FIELDS = ["title", "author", "series", "publisher", "year", "language", "isbn", "citekey", "tags"] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

/** What a book's note says, read. Every field is optional; unknown keys are never read. */
export interface BookDetails {
    title?: string;
    author?: string[];
    series?: string;
    publisher?: string;
    year?: number;
    language?: string;
    isbn?: string;
    /** The key a citation cites it by (#768 FR-5): a Pandoc / Better BibTeX name you set. */
    citekey?: string;
    tags?: string[];
    status?: BookStatus;
    collections?: string[];
}

/** A book's note, found: where it is, the book it links to, and what it says. */
export interface BookNoteEntry {
    path: string;
    source: string;
    details: BookDetails;
}

const text = (value: unknown): string | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value !== "string") return undefined;
    const clean = value.replace(/\s+/g, " ").trim();
    return clean || undefined;
};

/** A string or a list of strings, as a list without blanks or repeats. */
function list(value: unknown, strip?: (item: string) => string): string[] | undefined {
    const raw = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
    const out: string[] = [];
    for (const item of raw) {
        const clean = text(item);
        const kept = clean && strip ? strip(clean) : clean;
        if (kept && !out.includes(kept)) out.push(kept);
    }
    return out.length > 0 ? out : undefined;
}

const tagOf = (tag: string) => tag.replace(/^#+/, "").trim();

/** A year as a number: `2011`, `"2011"` and `"2011-10-25"` are all 2011. */
export function yearOf(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isInteger(value) && value > 0 && value < 10000) return value;
    const match = typeof value === "string" ? /^\s*(\d{3,4})(?:\b|-)/.exec(value) : null;
    return match ? Number(match[1]) : undefined;
}

/** An ISBN, read off an identifier: `urn:isbn:978-0-374-27563-1` → `9780374275631`. */
export function isbnOf(value: unknown): string | undefined {
    const raw = text(value);
    if (!raw) return undefined;
    const digits = raw.replace(/^(urn:)?isbn:?/i, "").replace(/[\s-]/g, "").toUpperCase();
    return /^(\d{13}|\d{9}[\dX])$/.test(digits) ? digits : undefined;
}

export function isBookStatus(value: unknown): value is BookStatus {
    return typeof value === "string" && (BOOK_STATUSES as readonly string[]).includes(value);
}

/**
 * Read a book's note's frontmatter (FR-2). `author` and `collections` may be written as a string or
 * a list; an unknown `status` is ignored; every other key is left alone — it is yours.
 */
export function readBookNote(frontmatter: unknown): BookDetails {
    if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) return {};
    const fm = frontmatter as Record<string, unknown>;
    const out: BookDetails = {};
    const title = text(fm.title);
    if (title) out.title = title;
    const author = list(fm.author);
    if (author) out.author = author;
    for (const key of ["series", "publisher", "language", "isbn", "citekey"] as const) {
        const value = text(fm[key]);
        if (value) out[key] = value;
    }
    const year = yearOf(fm.year);
    if (year) out.year = year;
    const tags = list(fm.tags, tagOf);
    if (tags) out.tags = tags;
    if (isBookStatus(fm.status)) out.status = fm.status;
    const collections = list(fm.collections);
    if (collections) out.collections = collections;
    return out;
}

/**
 * The status the shelf shows (FR-3): the one you set wins; unset, it is read from what the Library
 * already knows — *finished* once you reached the end, *reading* once you opened it, none before.
 * Nothing is written for a status that is only read.
 */
export function effectiveStatus(details: BookDetails | undefined, meta: Pick<SourceMeta, "done" | "at"> | undefined): BookStatus | null {
    if (details?.status) return details.status;
    if (meta?.done) return "finished";
    if ((meta?.at ?? 0) > 0) return "reading";
    return null;
}

/** What a book says about itself, read once — when its note is created. */
export interface DeclaredMetadata {
    title?: string;
    author?: string[];
    series?: string;
    publisher?: string;
    year?: number;
    language?: string;
    isbn?: string;
}

/** What an EPUB's package declares, as a book's note's fields. */
export function declaredFromPackage(pkg: Pick<EpubPackage, "title" | "authors" | "author" | "publisher" | "date" | "language" | "identifiers" | "series">): DeclaredMetadata {
    const out: DeclaredMetadata = {};
    if (pkg.title) out.title = pkg.title;
    const authors = list(pkg.authors ?? (pkg.author ? [pkg.author] : []));
    if (authors) out.author = authors;
    if (pkg.series) out.series = pkg.series;
    if (pkg.publisher) out.publisher = pkg.publisher;
    const year = yearOf(pkg.date);
    if (year) out.year = year;
    if (pkg.language) out.language = pkg.language;
    const isbn = (pkg.identifiers ?? []).map(isbnOf).find(Boolean);
    if (isbn) out.isbn = isbn;
    return out;
}

/** What a PDF's info dictionary declares (already cleaned of *Microsoft Word - draft3.doc*). */
export function declaredFromPdf(info: { title?: string; author?: string }): DeclaredMetadata {
    const out: DeclaredMetadata = {};
    if (info.title) out.title = info.title;
    const authors = list(info.author ? info.author.split(/\s*;\s*/) : []);
    if (authors) out.author = authors;
    return out;
}

/** A change to one or more fields: a value sets it, `null` removes it. */
export type BookChange = { [K in keyof BookDetails]?: BookDetails[K] | null };

/** The link a book's note keeps to its book: a wikilink to its full path, which Obsidian keeps up to date. */
export function bookLink(sourcePath: string): string {
    return `[[${sourcePath}]]`;
}

/**
 * Everything the first write puts in (FR-5): the link, what the file declares, then your change on
 * top. In the order {@link BOOK_FIELDS} reads; a field with no value is left out.
 */
export function bookNoteFields(sourcePath: string, declared: DeclaredMetadata, change: BookChange): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...declared };
    for (const [key, value] of Object.entries(change)) {
        if (value === null || value === undefined) delete merged[key];
        else merged[key] = value;
    }
    const out: Record<string, unknown> = { [BOOK_LINK_KEY]: bookLink(sourcePath) };
    for (const key of BOOK_FIELDS) {
        const value = merged[key];
        if (value === undefined || (Array.isArray(value) && value.length === 0) || value === "") continue;
        out[key] = value;
    }
    return out;
}

const yamlScalar = (value: unknown): string => (typeof value === "number" ? String(value) : JSON.stringify(String(value)));

/** The note itself: a frontmatter block, nothing else. Strings double-quoted, lists as lists. */
export function bookNoteMarkdown(fields: Record<string, unknown>): string {
    const lines = ["---"];
    for (const [key, value] of Object.entries(fields)) {
        if (Array.isArray(value)) {
            lines.push(`${key}:`);
            for (const item of value) lines.push(`  - ${yamlScalar(item)}`);
        } else {
            lines.push(`${key}: ${yamlScalar(value)}`);
        }
    }
    lines.push("---", "");
    return lines.join("\n");
}

/** A name a file can have on every system: no `\ / : * ? " < > | # ^ [ ]`, no leading dot. */
export function bookNoteFileName(title: string): string {
    const clean = title
        .replace(/[\\/:*?"<>|#^[\]]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^\.+/, "")
        .replace(/[. ]+$/, "")
        .slice(0, 120)
        .trim();
    return clean || "Book";
}

/** The first path in `folder` for `title` that is not taken: `Title.md`, then `Title 1.md`… */
export function freeBookNotePath(folder: string, title: string, taken: (path: string) => boolean): string {
    const dir = folder.replace(/^\/+|\/+$/g, "");
    const base = bookNoteFileName(title);
    const at = (name: string) => (dir ? `${dir}/${name}.md` : `${name}.md`);
    if (!taken(at(base))) return at(base);
    for (let n = 1; n < 1000; n++) if (!taken(at(`${base} ${n}`))) return at(`${base} ${n}`);
    return at(`${base} ${Date.now()}`);
}

/** The link a frontmatter value holds, when it holds one: `"[[Books/x.epub|x]]"` → `Books/x.epub`. */
export function linkTarget(value: unknown): string | null {
    const raw: unknown = Array.isArray(value) ? (value as unknown[])[0] : value;
    if (typeof raw !== "string") return null;
    const match = /^\s*\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]\s*$/.exec(raw);
    return match ? match[1].trim() : null;
}

/**
 * The book notes, by the book they link to (FR-1). When two notes claim one book the first by path
 * wins, so the answer never depends on the order the vault lists them in. Only a PDF or an EPUB is a
 * book a note can belong to.
 */
export function indexBookNotes(entries: Iterable<{ path: string; source: string; frontmatter: unknown }>): Map<string, BookNoteEntry> {
    const out = new Map<string, BookNoteEntry>();
    for (const entry of [...entries].sort((a, b) => a.path.localeCompare(b.path))) {
        if (!sourceFormat(entry.source) || out.has(entry.source)) continue;
        out.set(entry.source, { path: entry.path, source: entry.source, details: readBookNote(entry.frontmatter) });
    }
    return out;
}

/** Every collection in use, once each, in alphabetical order — what *+ Collection* suggests. */
export function collectionsInUse(notes: Iterable<{ details: BookDetails }>): string[] {
    const seen = new Map<string, string>();
    for (const note of notes) for (const name of note.details.collections ?? []) if (!seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * What typing in a Details field means (FR-8). An empty field removes the key. An author list and
 * tags are split on `;` and `,`; a year must be a year. `undefined` when the text is not a value
 * the field can hold — the field says so and nothing is written.
 */
export function parseField(field: TextField, raw: string): BookChange | undefined {
    const value = raw.replace(/\s+/g, " ").trim();
    if (!value) return { [field]: null };
    if (field === "author") return { author: list(value.split(/\s*;\s*/)) ?? null };
    if (field === "tags") return { tags: list(value.split(/[\s,;]+/), tagOf) ?? null };
    if (field === "year") {
        if (!/^\d{1,4}$/.test(value)) return undefined;
        return { year: Number(value) };
    }
    if (field === "isbn") {
        const isbn = isbnOf(value);
        return isbn ? { isbn } : undefined;
    }
    // A key Pandoc can cite (#768 FR-5): a letter, digit or `_` first, then no space.
    if (field === "citekey") return CITEKEY.test(value) ? { citekey: value } : undefined;
    return { [field]: value };
}

/** What a citation key may be: Pandoc's `@key` grammar, without the `@`. */
export const CITEKEY = /^[\p{L}\p{N}_][\p{L}\p{N}_:.#$%&+?<>~/-]*$/u;

/** A field as the Details section shows it. */
export function fieldText(details: BookDetails, field: TextField): string {
    const value = details[field];
    if (value === undefined) return "";
    if (field === "author") return (value as string[]).join("; ");
    if (field === "tags") return (value as string[]).join(", ");
    return String(value);
}
