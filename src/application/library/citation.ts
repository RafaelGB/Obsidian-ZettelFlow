import type { BookDetails } from "./bookNote";
import { recallCitation } from "./recallNote";
import { fold } from "./shelf";

/**
 * **Cite a passage** (#768, epic #742) — pure, no `obsidian`.
 *
 * A passage, a highlight or a whole book, ready to paste in five forms: a Markdown quote that links
 * back to its place, an inline *(Kahneman, 2011, p. 42)*, a Pandoc citation key, BibTeX and CSL JSON.
 * Everything comes from what the vault holds — the book's note (#743), or an article's own frontmatter
 * (#744) — and the passage's place (#751). A field that is not there is **left out, never guessed**:
 * *n.d.* stands for a missing year and the title stands where the author is missing, as citation
 * styles do, and {@link missingFor} says what a form lacks so it can be fixed where it lives.
 *
 * The forms are data, not interface text: `p.`, `ch.`, `n.d.` and `et al.` follow the conventions of
 * English whatever language the plugin speaks (FR-9).
 */

export const CITE_FORMS = ["markdown", "inline", "key", "bibtex", "csl"] as const;
export type CiteForm = (typeof CITE_FORMS)[number];

/** The form the panel shows first: the one chosen last, Markdown before any. */
export function citeFormOf(value: unknown): CiteForm {
    return typeof value === "string" && (CITE_FORMS as readonly string[]).includes(value) ? (value as CiteForm) : "markdown";
}

/** What is cited: a book, a paper (a PDF without an ISBN), an article saved from the web. */
export type CiteKind = "book" | "paper" | "article";

/** One author, as citations name them. */
export interface Person {
    family: string;
    given?: string;
}

/** What is known of the source. Only `kind` and `title` are always there. */
export interface CiteFields {
    kind: CiteKind;
    title: string;
    authors: Person[];
    year?: number;
    publisher?: string;
    series?: string;
    isbn?: string;
    language?: string;
    /** An article's web address. */
    url?: string;
    /** When the article was saved, `YYYY-MM-DD`: BibTeX's `urldate`, CSL's `accessed`. */
    urldate?: string;
    /** The book note's own `citekey`, when you set one (FR-5). */
    citekey?: string;
}

/** Where the passage is: its page, or (in a book without pages) its chapter. */
export interface CitePlace {
    page?: string;
    /** The chapter as the book labels it: `3 · The lazy controller`, `Chapter 3`, `Introduction`. */
    chapter?: string;
}

/** Everything a form is drawn from. */
export interface CiteInput {
    fields: CiteFields;
    place?: CitePlace;
    /** The passage's words. Absent: the whole book is cited. */
    passage?: string;
    /** The link back to the place (#751): `[[Books/x.epub#OEBPS/ch03.xhtml|Title]]`. */
    link?: string;
}

/** The fields a form can lack, in the order a line names them. */
export type MissingField = "author" | "year" | "publisher";

// ── reading what the vault holds ────────────────────────────────────────────

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

/** One name: *Family, Given* or *Given Family*; a name of one word is a family name (FR-6). */
export function parsePerson(raw: string): Person | null {
    const name = clean(raw);
    if (!name) return null;
    const comma = name.indexOf(",");
    if (comma >= 0) {
        const family = clean(name.slice(0, comma));
        const given = clean(name.slice(comma + 1));
        if (!family) return given ? { family: given } : null;
        return given ? { family, given } : { family };
    }
    const words = name.split(" ");
    if (words.length === 1) return { family: name };
    return { family: words[words.length - 1], given: words.slice(0, -1).join(" ") };
}

/** The authors, read as written (FR-6): one per entry, or joined by *and* / *&* inside one. */
export function parseAuthors(raw: readonly string[] | string | undefined): Person[] {
    const entries = typeof raw === "string" ? [raw] : (raw ?? []);
    const out: Person[] = [];
    for (const entry of entries) {
        for (const part of entry.split(/\s+(?:and|&)\s+|\s*&\s*/)) {
            const person = parsePerson(part);
            if (person) out.push(person);
        }
    }
    return out;
}

/** A local date as `YYYY-MM-DD`. */
function isoDay(at: number): string {
    const d = new Date(at);
    const two = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** What a book's note, or an article's frontmatter, says — as a citation's fields (FR-3). */
export interface CiteSource {
    kind: "book" | "paper" | "article";
    /** The title shown when the details have none: the file's own. */
    fileTitle: string;
    details?: BookDetails & { citekey?: string };
    /** An article's web address and when it was saved (#744). */
    url?: string;
    created?: number;
}

/** The fields known, and nothing else (FR-3): a PDF with an ISBN is a book. */
export function citationFields(source: CiteSource): CiteFields {
    const d = source.details ?? {};
    const kind: CiteKind = source.kind === "paper" && d.isbn ? "book" : source.kind;
    const out: CiteFields = { kind, title: d.title ?? clean(source.fileTitle), authors: parseAuthors(d.author) };
    if (d.year) out.year = d.year;
    for (const key of ["publisher", "series", "isbn", "language", "citekey"] as const) {
        const value = d[key];
        if (typeof value === "string" && clean(value)) out[key] = clean(value);
    }
    if (kind === "article") {
        if (source.url) out.url = source.url;
        if (source.created !== undefined) out.urldate = isoDay(source.created);
    }
    return out;
}

// ── the key (FR-5) ──────────────────────────────────────────────────────────

/** The words a key never starts its title part with. */
const STOP_WORDS = new Set(["a", "an", "the", "of", "on", "in", "and", "for", "to"]);

const ascii = (value: string) => fold(value).replace(/[^a-z0-9]/g, "");

/** The key proposed from the first author's family name, the year and the title's first significant word. */
export function proposedKey(fields: Pick<CiteFields, "authors" | "year" | "title">): string {
    const words = fold(fields.title)
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
    const word = words.find((w) => !STOP_WORDS.has(w)) ?? words[0] ?? "";
    const family = fields.authors[0] ? ascii(fields.authors[0].family) : "";
    const key = family ? `${family}${fields.year ?? ""}${word}` : `${word}${fields.year ?? ""}`;
    return key || "source";
}

/** The key cited: the note's own `citekey` when it has one, the proposed one otherwise. */
export function citeKey(fields: CiteFields): string {
    return fields.citekey ?? proposedKey(fields);
}

// ── what a form lacks (FR-4) ────────────────────────────────────────────────

/** The fields `form` needs and the source does not have — in the order a line names them. */
export function missingFor(form: CiteForm, fields: CiteFields): MissingField[] {
    const out: MissingField[] = [];
    if (form === "key" && fields.citekey) return out;
    if (fields.authors.length === 0) out.push("author");
    if (!fields.year) out.push("year");
    if (form === "bibtex" && fields.kind === "book" && !fields.publisher) out.push("publisher");
    return out;
}

// ── the place ───────────────────────────────────────────────────────────────

/** `p. 42`, `pp. 42–43`, `ch. 3` — or a section named as the book names it; none when unknown. */
export function locatorText(place: CitePlace | undefined): string | undefined {
    if (!place) return undefined;
    const page = place.page ? clean(place.page) : "";
    if (page) return /[-–]/.test(page) ? `pp. ${page.replace(/\s*[-–]\s*/, "–")}` : `p. ${page}`;
    const label = place.chapter ? clean(place.chapter) : "";
    if (!label) return undefined;
    const number = /^(\d+)\b/.exec(label)?.[1] ?? /\b(?:chapter|ch\.?|cap[ií]tulo|cap\.)\s*(\d+)\b/i.exec(label)?.[1];
    if (number) return `ch. ${number}`;
    const dot = label.indexOf("·");
    return dot >= 0 ? clean(label.slice(dot + 1)) || label : label;
}

/** The page cited, bare, for CSL's `page` (`42`, `42-43`). */
function pageOf(place: CitePlace | undefined): string | undefined {
    const page = place?.page ? clean(place.page) : "";
    return page ? page.replace(/\s*[-–]\s*/, "-") : undefined;
}

// ── the five forms (FR-2) ───────────────────────────────────────────────────

const fullName = (p: Person) => (p.given ? `${p.given} ${p.family}` : p.family);

/** Names as a sentence says them: *A*, *A & B*, *A et al.* */
function joined(people: readonly Person[], name: (p: Person) => string): string {
    if (people.length === 0) return "";
    if (people.length === 1) return name(people[0]);
    if (people.length === 2) return `${name(people[0])} & ${name(people[1])}`;
    return `${name(people[0])} et al.`;
}

const yearText = (fields: CiteFields) => (fields.year ? String(fields.year) : "n.d.");

/** The passage as a Markdown quote: each paragraph its own lines, a bare `>` between them. */
function quoted(passage: string): string[] {
    const paragraphs = passage
        .split(/\n\s*\n/)
        .map(clean)
        .filter(Boolean);
    const out: string[] = [];
    paragraphs.forEach((p, i) => {
        if (i > 0) out.push(">");
        out.push(`> ${p}`);
    });
    return out;
}

function markdown(input: CiteInput): string {
    const { fields } = input;
    const who = joined(fields.authors, fullName);
    const where = locatorText(input.place);
    let line = `${who ? `${who}, ` : ""}*${fields.title}* (${yearText(fields)})${where ? `, ${where}` : ""}`;
    if (input.link) line += ` · ${input.link}`;
    const passage = input.passage ? quoted(input.passage) : [];
    if (passage.length === 0) return `— ${line}`;
    return [...passage, `> — ${line}`].join("\n");
}

function inline(input: CiteInput): string {
    const { fields } = input;
    const who = joined(fields.authors, (p) => p.family) || fields.title;
    const where = locatorText(input.place);
    return `(${[who, yearText(fields), ...(where ? [where] : [])].join(", ")})`;
}

function keyForm(input: CiteInput): string {
    const where = locatorText(input.place);
    return `[@${citeKey(input.fields)}${where ? `, ${where}` : ""}]`;
}

/** A value inside BibTeX's braces, its special characters escaped (AC-2). */
export function bibEscape(value: string): string {
    return clean(value).replace(/[{}&%$#_]/g, (ch) => `\\${ch}`);
}

const BIB_TYPE: Record<CiteKind, string> = { book: "book", paper: "article", article: "online" };

function bibtex(input: CiteInput): string {
    const { fields } = input;
    const rows: [string, string][] = [];
    if (fields.authors.length > 0) rows.push(["author", fields.authors.map((p) => (p.given ? `${p.family}, ${p.given}` : p.family)).join(" and ")]);
    rows.push(["title", fields.title]);
    if (fields.year) rows.push(["year", String(fields.year)]);
    if (fields.publisher) rows.push(["publisher", fields.publisher]);
    if (fields.series) rows.push(["series", fields.series]);
    if (fields.isbn) rows.push(["isbn", fields.isbn]);
    if (fields.language) rows.push(["language", fields.language]);
    if (fields.url) rows.push(["url", fields.url]);
    if (fields.urldate) rows.push(["urldate", fields.urldate]);
    // A web address is not escaped: BibTeX reads `url` verbatim.
    const value = (key: string, text: string) => (key === "url" ? clean(text) : bibEscape(text));
    const body = rows.map(([key, text]) => `  ${key} = {${value(key, text)}}`).join(",\n");
    return `@${BIB_TYPE[fields.kind]}{${citeKey(fields)},\n${body}\n}`;
}

const CSL_TYPE: Record<CiteKind, string> = { book: "book", paper: "article", article: "webpage" };

/** Every key the CSL form may carry — and nothing else (AC-2). */
export const CSL_KEYS = ["id", "type", "title", "author", "issued", "publisher", "collection-title", "ISBN", "language", "URL", "accessed", "page", "chapter-number"] as const;

function csl(input: CiteInput): string {
    const { fields } = input;
    const item: Record<string, unknown> = { id: citeKey(fields), type: CSL_TYPE[fields.kind], title: fields.title };
    if (fields.authors.length > 0) item.author = fields.authors.map((p) => (p.given ? { family: p.family, given: p.given } : { family: p.family }));
    if (fields.year) item.issued = { "date-parts": [[fields.year]] };
    if (fields.publisher) item.publisher = fields.publisher;
    if (fields.series) item["collection-title"] = fields.series;
    if (fields.isbn) item.ISBN = fields.isbn;
    if (fields.language) item.language = fields.language;
    if (fields.url) item.URL = fields.url;
    if (fields.urldate) item.accessed = { "date-parts": [fields.urldate.split("-").map(Number)] };
    const page = pageOf(input.place);
    if (page) item.page = page;
    else {
        const where = locatorText(input.place);
        const chapter = where?.startsWith("ch. ") ? where.slice(4) : undefined;
        if (chapter) item["chapter-number"] = chapter;
    }
    return JSON.stringify([item], null, 2);
}

/** **The text of a form**, exactly as it is shown and copied (FR-8). */
export function formatCitation(form: CiteForm, input: CiteInput): string {
    switch (form) {
        case "markdown":
            return markdown(input);
        case "inline":
            return inline(input);
        case "key":
            return keyForm(input);
        case "bibtex":
            return bibtex(input);
        case "csl":
            return csl(input);
    }
}

/**
 * The link back (FR-2.1): the one #751 writes into a note's `source` — through its one producer,
 * the same as recall's citation (#760) — the book's file and the chapter in its subpath, never a
 * block id. An article links its note.
 */
export function citeLink(file: string, title: string, chapter?: string): string {
    return recallCitation({ file, ...(chapter ? { chapter } : {}), label: "", bookTitle: title });
}
