import { isBookStatus, readBookNote, yearOf, type BookDetails } from "./bookNote";

/**
 * **An article** (#744, epic #742) — pure.
 *
 * A page you saved from the web with Obsidian Web Clipper is an ordinary note: its frontmatter says
 * where it came from (`source: https://…`), who wrote it and when, and its body is the page. The
 * Library shelves it beside the books, and the Reader reads it like one — **without a copy**: the
 * clipping stays the note it is.
 *
 * One rule, which you can see and change: a note is an article when it is in the **articles
 * folder** (and its subfolders) and its `source` is a web address. A `clippings` tag alone does not
 * make one — a note outside the folder is never an article, whatever it carries.
 */

/** Web Clipper's own default folder. */
export const ARTICLES_DEFAULT = "Clippings";

/** The folder as a path prefix, without slashes at either end. Empty means articles are off. */
export function articlesFolder(raw: unknown): string {
    return typeof raw === "string" ? raw.trim().replace(/^\/+|\/+$/g, "") : "";
}

/** Whether a vault path is in `folder` or one of its subfolders. */
export function inFolder(path: string, folder: string): boolean {
    const dir = articlesFolder(folder);
    return dir.length > 0 && path.startsWith(`${dir}/`);
}

const WEB = /^https?:\/\/[^\s/$.?#][^\s]*$/i;

/** The web address a `source` value holds, when it holds one: a string, or the first of a list. */
export function webSource(value: unknown): string | null {
    const raw: unknown = Array.isArray(value) ? (value as unknown[]).find((item) => typeof item === "string") : value;
    if (typeof raw !== "string") return null;
    const clean = raw.trim();
    return WEB.test(clean) ? clean : null;
}

/** FR-1: a Markdown note in the articles folder whose `source` is a web address. */
export function isArticle(path: string, frontmatter: unknown, folder: string): boolean {
    if (!path.toLowerCase().endsWith(".md") || !inFolder(path, folder)) return false;
    if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) return false;
    return webSource((frontmatter as Record<string, unknown>).source) !== null;
}

/** The host of a web address, without `www.`: the byline when nobody signed it. */
export function hostOf(url: string): string | undefined {
    const match = /^https?:\/\/([^/?#:@]+@)?([^/?#:]+)/i.exec(url.trim());
    const host = match?.[2]?.toLowerCase().replace(/^www\./, "");
    return host || undefined;
}

/** A name, out of what Web Clipper writes for an author: `[[Jane Doe]]`, `[[People/Jane Doe|Jane]]`, or plain text. */
export function nameOf(value: string): string {
    const link = /^\s*\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]\s*$/.exec(value);
    if (!link) return value.replace(/\s+/g, " ").trim();
    const alias = link[2]?.trim();
    if (alias) return alias;
    return (link[1].split("/").pop() ?? link[1]).replace(/\.md$/i, "").trim();
}

/** A date Web Clipper wrote (`2025-03-02`, `2025-03-02T10:15`), as a time in this device's zone. */
export function dateOf(value: unknown): number | undefined {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : undefined;
    if (typeof value !== "string") return undefined;
    const match = /^\s*(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value);
    if (!match) return undefined;
    const [y, mo, d, h, mi, s] = match.slice(1).map((part) => (part === undefined ? 0 : Number(part)));
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
    const at = new Date(y, mo - 1, d, h, mi, s).getTime();
    return Number.isFinite(at) ? at : undefined;
}

/** What an article says about itself (FR-4), read off its own frontmatter. */
export interface ArticleFields {
    /** Its fields as a book's note's: the title, the authors' names, the year, the tags, a status, collections. */
    details: BookDetails;
    /** The site, for the byline when nobody signed it. */
    host?: string;
    description?: string;
    /** Web Clipper's `created`, when it wrote one. */
    created?: number;
}

/**
 * The fields of an article (FR-4): `author` as names (Web Clipper writes a list of links), the year
 * of `published`, and the site's host. Every other key is the note's own and is never read.
 */
export function articleFields(frontmatter: unknown): ArticleFields {
    const fm = frontmatter && typeof frontmatter === "object" && !Array.isArray(frontmatter) ? (frontmatter as Record<string, unknown>) : {};
    const base = readBookNote(fm);
    const details: BookDetails = {};
    if (base.title) details.title = base.title;
    const names = (base.author ?? []).map(nameOf).filter((name, i, all) => name.length > 0 && all.indexOf(name) === i);
    if (names.length > 0) details.author = names;
    const published = fm.published instanceof Date ? fm.published.getFullYear() : yearOf(fm.published);
    if (published) details.year = published;
    if (base.tags) details.tags = base.tags;
    if (isBookStatus(fm.status)) details.status = fm.status;
    if (base.collections) details.collections = base.collections;
    const out: ArticleFields = { details };
    const source = webSource(fm.source);
    const host = source ? hostOf(source) : undefined;
    if (host) out.host = host;
    if (typeof fm.description === "string" && fm.description.trim()) out.description = fm.description.replace(/\s+/g, " ").trim();
    const created = dateOf(fm.created);
    if (created !== undefined) out.created = created;
    return out;
}

/** *Added* (FR-8): Web Clipper's `created` when it wrote one, else when the file came into the vault. */
export function articleAdded(created: number | undefined, ctime: number | undefined): number {
    return created ?? ctime ?? 0;
}

/** A heading inside a section: what Contents lists under it. */
export interface ArticleHeading {
    title: string;
    depth: number;
}

/** One section of an article: what the Reader draws as one chapter. */
export interface ArticleSection {
    title: string;
    /** The section's Markdown, with the footnotes it refers to after it. */
    markdown: string;
    /** Its headings, in order — its own first, when it opens with one. */
    headings: ArticleHeading[];
}

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const FOOTNOTE_DEF = /^\[\^([^\]\s]+)\]:/;
const FOOTNOTE_REF = /\[\^([^\]\s]+)\](?!:)/g;

/** A heading's words as a reader sees them: no emphasis marks, links as their text. */
function headingText(raw: string): string {
    return raw
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
        .replace(/\[\[([^\]]+)\]\]/g, "$1")
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[*_`~]+/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * **The sections of an article** (#744 FR-5): its headings at the shallowest level it uses — H1 if
 * it has any, else H2, and so on. The text before the first of them is a section of its own, named
 * after the article. A note with no heading is one section.
 *
 * A footnote is read where it is referenced: each section carries the definitions of the footnotes it
 * mentions, so a mark in the third section opens its note even when the page put every note at its
 * end. Headings inside a fenced code block are code, not headings.
 */
export function articleSections(body: string, title: string): ArticleSection[] {
    const lines = body.split(/\r?\n/);
    type Line = { text: string; heading?: ArticleHeading };
    const kept: Line[] = [];
    const notes = new Map<string, string[]>();
    let fence: string | null = null;
    let note: string[] | null = null;
    for (const text of lines) {
        const open = FENCE.exec(text);
        if (fence) {
            if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null;
            kept.push({ text });
            continue;
        }
        if (open) {
            fence = open[1];
            note = null;
            kept.push({ text });
            continue;
        }
        const def = FOOTNOTE_DEF.exec(text);
        if (def) {
            note = [text];
            if (!notes.has(def[1])) notes.set(def[1], note);
            continue;
        }
        // A definition goes on over indented lines, and over a blank line before one.
        if (note && (/^( {2,}|\t)/.test(text) || text.trim() === "")) {
            note.push(text);
            continue;
        }
        note = null;
        const heading = HEADING.exec(text);
        kept.push(heading ? { text, heading: { title: headingText(heading[2]) || title, depth: heading[1].length } } : { text });
    }
    const depths = kept.filter((line) => line.heading).map((line) => line.heading!.depth);
    const top = depths.length > 0 ? Math.min(...depths) : 0;

    const sections: { title: string; lines: string[]; headings: ArticleHeading[] }[] = [];
    let current: { title: string; lines: string[]; headings: ArticleHeading[] } = { title, lines: [], headings: [] };
    for (const line of kept) {
        if (line.heading && line.heading.depth === top) {
            if (current.lines.some((text) => text.trim()) || sections.length > 0 || current.headings.length > 0) sections.push(current);
            current = { title: line.heading.title, lines: [line.text], headings: [line.heading] };
            continue;
        }
        if (line.heading) current.headings.push(line.heading);
        current.lines.push(line.text);
    }
    sections.push(current);
    // Before the first heading there was nothing to read: that is not a section.
    const real = sections.filter((section, i) => i > 0 || section.headings.length > 0 || section.lines.some((text) => text.trim()) || sections.length === 1);

    return real.map((section) => {
        const markdown = section.lines.join("\n").replace(/^\n+|\s+$/g, "");
        const cited: string[] = [];
        for (const match of markdown.matchAll(FOOTNOTE_REF)) if (notes.has(match[1]) && !cited.includes(match[1])) cited.push(match[1]);
        const tail = cited.map((id) => notes.get(id)!.join("\n").replace(/\s+$/, "")).join("\n");
        return { title: section.title, markdown: tail ? `${markdown}\n\n${tail}\n` : `${markdown}\n`, headings: section.headings };
    });
}
