import { progressOf, sourceFormat, type LibraryMeta } from "./sourceMeta";

/**
 * **The Library shelf** (#680, epic #675) — pure: what is on it, in which order, and what came of
 * each thing on it.
 *
 * Three kinds share the shelf (owner, 2026-10-06): **books** and **papers** — the EPUBs and PDFs
 * already in your vault (L1) — and **paths**, the readings across your own notes you saved at the
 * end of one (#672). Each item says how far you are, how many passages you marked and how many
 * notes were **born** from it — the last one is the point of the whole loop.
 */

export type ShelfKind = "book" | "paper" | "path";
export type ShelfFormat = "pdf" | "epub" | "path";
export type ShelfFilter = "all" | "books" | "papers" | "paths";
export type ShelfSort = "recent" | "highlighted" | "title";

export const SHELF_FILTERS: readonly ShelfFilter[] = ["all", "books", "papers", "paths"];
export const SHELF_SORTS: readonly ShelfSort[] = ["recent", "highlighted", "title"];

/**
 * A PDF this long is a book, not a paper. Most papers run under forty pages and most books over
 * a hundred; the line sits between them, and a PDF whose length is not read yet is a paper.
 */
export const BOOK_PAGES = 60;

export interface ShelfItem {
    /** The file's path, or `path:<id>` for a saved reading. */
    id: string;
    kind: ShelfKind;
    format: ShelfFormat;
    title: string;
    author?: string;
    /** The source file. Absent for a path. */
    file?: string;
    /** 0 to 1. */
    progress: number;
    highlights: number;
    born: number;
    /** When you last read it; 0 when never. */
    lastRead: number;
    /** A PDF with no text layer. */
    imageOnly?: boolean;
    /** Pages, spine items or notes. */
    chapters?: number;
    /** The chapter you were last on. */
    place?: number;
    /** A saved path: its id and its notes, in reading order. */
    savedId?: string;
    seed?: string;
    paths?: string[];
}

export interface ShelfSource {
    path: string;
    basename: string;
}

export interface ShelfSaved {
    id: string;
    name: string;
    seed: string;
    paths: string[];
    at: number;
}

export interface ShelfInputs {
    sources: readonly ShelfSource[];
    meta: LibraryMeta;
    saved: readonly ShelfSaved[];
    /** Where each saved path was left, by its id. */
    pathPlaces?: ReadonlyMap<string, { chapter: number; total: number; at: number }>;
    /** Highlights by the file (or note) they were made on. */
    highlights: ReadonlyMap<string, number>;
    /** Notes citing each source, by the source's path. */
    born: ReadonlyMap<string, number>;
}

/** What a file is called on the shelf before the file says otherwise: its name, tidied. */
export function titleFromName(basename: string): string {
    const name = basename.replace(/\.(pdf|epub)$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
    return name || basename;
}

export function buildShelf(inputs: ShelfInputs): ShelfItem[] {
    const items: ShelfItem[] = [];
    for (const source of inputs.sources) {
        const format = sourceFormat(source.path);
        if (!format) continue;
        const meta = inputs.meta[source.path];
        const pages = meta?.chapters;
        const kind: ShelfKind = format === "epub" || (pages !== undefined && pages > BOOK_PAGES) ? "book" : "paper";
        items.push({
            id: source.path,
            kind,
            format,
            title: meta?.title ?? titleFromName(source.basename),
            ...(meta?.author ? { author: meta.author } : {}),
            file: source.path,
            progress: progressOf(meta),
            highlights: inputs.highlights.get(source.path) ?? 0,
            born: inputs.born.get(source.path) ?? 0,
            lastRead: meta?.at ?? 0,
            ...(meta?.imageOnly ? { imageOnly: true } : {}),
            ...(pages ? { chapters: pages } : {}),
            ...(meta?.chapter !== undefined ? { place: meta.chapter } : {}),
        });
    }
    for (const saved of inputs.saved) {
        const place = inputs.pathPlaces?.get(saved.id);
        const total = saved.paths.length;
        const highlights = saved.paths.reduce((sum, path) => sum + (inputs.highlights.get(path) ?? 0), 0);
        items.push({
            id: `path:${saved.id}`,
            kind: "path",
            format: "path",
            title: saved.name,
            progress: place && total > 0 ? Math.min(1, (place.chapter + 1) / total) : 0,
            highlights,
            born: 0,
            lastRead: Math.max(saved.at, place?.at ?? 0),
            chapters: total,
            ...(place ? { place: place.chapter } : {}),
            savedId: saved.id,
            seed: saved.seed,
            paths: [...saved.paths],
        });
    }
    return items;
}

/** Lowercase, without accents: *Sönke* is found by *sonke*. */
export function fold(value: string): string {
    return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const matchesFilter = (item: ShelfItem, filter: ShelfFilter): boolean =>
    filter === "all" ||
    (filter === "books" && item.kind === "book") ||
    (filter === "papers" && item.kind === "paper") ||
    (filter === "paths" && item.kind === "path");

/** How many items each filter would show, before the search. */
export function shelfCounts(items: readonly ShelfItem[]): Record<ShelfFilter, number> {
    const counts: Record<ShelfFilter, number> = { all: items.length, books: 0, papers: 0, paths: 0 };
    for (const item of items) {
        if (item.kind === "book") counts.books++;
        else if (item.kind === "paper") counts.papers++;
        else counts.paths++;
    }
    return counts;
}

export interface ShelfQuery {
    filter: ShelfFilter;
    sort: ShelfSort;
    search: string;
}

/** The shelf as asked for: one filter, a search over titles and authors, one order. */
export function viewShelf(items: readonly ShelfItem[], query: ShelfQuery): ShelfItem[] {
    const needle = fold(query.search.trim());
    const shown = items.filter(
        (item) => matchesFilter(item, query.filter) && (!needle || fold(`${item.title} ${item.author ?? ""}`).includes(needle))
    );
    const byTitle = (a: ShelfItem, b: ShelfItem) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
    if (query.sort === "title") return shown.sort(byTitle);
    if (query.sort === "highlighted") return shown.sort((a, b) => b.highlights - a.highlights || b.lastRead - a.lastRead || byTitle(a, b));
    // Recently read first; never-opened things after, by title, so a new book is easy to find.
    return shown.sort((a, b) => b.lastRead - a.lastRead || byTitle(a, b));
}

/** How many sources *Continue reading* offers. */
export const CONTINUE_LIMIT = 2;

/** What you were last in and have not finished — the reason to open the Library. */
export function continueReading(items: readonly ShelfItem[]): ShelfItem[] {
    return items
        .filter((item) => item.lastRead > 0 && item.progress < 1)
        .sort((a, b) => b.lastRead - a.lastRead)
        .slice(0, CONTINUE_LIMIT);
}
