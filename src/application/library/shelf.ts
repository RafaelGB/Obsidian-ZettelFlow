import { progressOf, sourceFormat, type LibraryMeta } from "./sourceMeta";
import { BOOK_STATUSES, effectiveStatus, type BookDetails, type BookNoteEntry, type BookStatus } from "./bookNote";

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
    /**
     * Where it stands for you (#743): the status its note sets, or the one read from your reading —
     * *finished* once you reached the end, *reading* once you opened it. Absent before either.
     */
    status?: BookStatus;
    /** Its book's note (#743), found by the note's link to it — wherever the note is kept. */
    note?: string;
    /** What its note says. Absent while it has none. */
    details?: BookDetails;
    collections?: string[];
    series?: string;
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
    /** The book notes, by the source each links to (#743). Read from the metadata cache. */
    notes?: ReadonlyMap<string, BookNoteEntry>;
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
        // The note's title and author win over the file's (#743 FR-9).
        const note = inputs.notes?.get(source.path);
        const details = note?.details;
        const author = details?.author?.join(", ") ?? meta?.author;
        const status = effectiveStatus(details, meta);
        items.push({
            id: source.path,
            kind,
            format,
            title: details?.title ?? meta?.title ?? titleFromName(source.basename),
            ...(author ? { author } : {}),
            file: source.path,
            progress: progressOf(meta),
            highlights: inputs.highlights.get(source.path) ?? 0,
            born: inputs.born.get(source.path) ?? 0,
            lastRead: meta?.at ?? 0,
            ...(meta?.imageOnly ? { imageOnly: true } : {}),
            ...(pages ? { chapters: pages } : {}),
            ...(meta?.chapter !== undefined ? { place: meta.chapter } : {}),
            ...(status ? { status } : {}),
            ...(note ? { note: note.path, details: note.details } : {}),
            ...(details?.collections ? { collections: [...details.collections] } : {}),
            ...(details?.series ? { series: details.series } : {}),
        });
    }
    for (const saved of inputs.saved) {
        const place = inputs.pathPlaces?.get(saved.id);
        const total = saved.paths.length;
        const highlights = saved.paths.reduce((sum, path) => sum + (inputs.highlights.get(path) ?? 0), 0);
        const progress = place && total > 0 ? Math.min(1, (place.chapter + 1) / total) : 0;
        // A path has no note: where it stands is read from where you left it.
        const status: BookStatus | null = progress >= 1 ? "finished" : place ? "reading" : null;
        items.push({
            id: `path:${saved.id}`,
            kind: "path",
            format: "path",
            title: saved.name,
            progress,
            highlights,
            born: 0,
            lastRead: Math.max(saved.at, place?.at ?? 0),
            chapters: total,
            ...(place ? { place: place.chapter } : {}),
            savedId: saved.id,
            seed: saved.seed,
            paths: [...saved.paths],
            ...(status ? { status } : {}),
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

export type StatusFilter = "all" | BookStatus;
export const STATUS_FILTERS: readonly StatusFilter[] = ["all", ...BOOK_STATUSES];

export interface ShelfQuery {
    filter: ShelfFilter;
    sort: ShelfSort;
    search: string;
    /** Where it stands for you (#743); every status when absent. */
    status?: StatusFilter;
    /** One collection (#743); every collection when absent. */
    collection?: string | null;
}

/** What the search reads (#743 FR-10): the title, the author, the series and the collections. */
function haystack(item: ShelfItem): string {
    return fold([item.title, item.author ?? "", item.series ?? "", ...(item.collections ?? [])].join(" "));
}

/** The shelf as asked for: one filter, a status, a collection, a search, one order. */
export function viewShelf(items: readonly ShelfItem[], query: ShelfQuery): ShelfItem[] {
    const needle = fold(query.search.trim());
    const status = query.status ?? "all";
    const collection = query.collection ? fold(query.collection) : null;
    const shown = items.filter(
        (item) =>
            matchesFilter(item, query.filter) &&
            (status === "all" || item.status === status) &&
            (!collection || (item.collections ?? []).some((name) => fold(name) === collection)) &&
            (!needle || haystack(item).includes(needle))
    );
    const byTitle = (a: ShelfItem, b: ShelfItem) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
    if (query.sort === "title") return shown.sort(byTitle);
    if (query.sort === "highlighted") return shown.sort((a, b) => b.highlights - a.highlights || b.lastRead - a.lastRead || byTitle(a, b));
    // Recently read first; never-opened things after, by title, so a new book is easy to find.
    return shown.sort((a, b) => b.lastRead - a.lastRead || byTitle(a, b));
}

/** How many sources *Continue reading* offers. */
export const CONTINUE_LIMIT = 2;

/**
 * What you were last in and have not finished — the reason to open the Library. A book you said
 * you finished, or put back to *Want to read*, is not offered again (#743).
 */
export function continueReading(items: readonly ShelfItem[]): ShelfItem[] {
    return items
        .filter((item) => item.lastRead > 0 && item.progress < 1 && item.status !== "finished" && item.status !== "to-read")
        .sort((a, b) => b.lastRead - a.lastRead)
        .slice(0, CONTINUE_LIMIT);
}

/** What you said you want to read (#743 FR-9): the section that follows *Continue reading*. */
export function wantToRead(items: readonly ShelfItem[]): ShelfItem[] {
    return items.filter((item) => item.status === "to-read");
}

/** How many items each status chip would show (#743). */
export function statusCounts(items: readonly ShelfItem[]): Record<StatusFilter, number> {
    const counts: Record<StatusFilter, number> = { all: items.length, "to-read": 0, reading: 0, finished: 0 };
    for (const item of items) if (item.status) counts[item.status]++;
    return counts;
}

/** Every collection on the shelf, once each, alphabetically: the collection chips (#743). */
export function shelfCollections(items: readonly ShelfItem[]): string[] {
    const seen = new Map<string, string>();
    for (const item of items) for (const name of item.collections ?? []) if (!seen.has(fold(name))) seen.set(fold(name), name);
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
