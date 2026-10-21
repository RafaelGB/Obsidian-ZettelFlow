import { progressOf, sourceFormat, type LibraryMeta } from "./sourceMeta";
import { effectiveStatus, type BookDetails, type BookNoteEntry, type BookStatus } from "./bookNote";

/**
 * **The Library shelf** (#680, epic #675) — pure: what is on it, in which order, and what came of
 * each thing on it.
 *
 * Four kinds share the shelf (owner, 2026-10-06): **books** and **papers** — the EPUBs and PDFs
 * already in your vault (L1) — **articles**, the pages you saved with Web Clipper (#744), and
 * **paths**, the readings across your own notes you saved at the end of one (#672). Each item says how far you are, how many passages you marked and how many
 * notes were **born** from it — the last one is the point of the whole loop.
 */

export type ShelfKind = "book" | "paper" | "article" | "path";
export type ShelfFormat = "pdf" | "epub" | "article" | "path";
export type ShelfFilter = "all" | "books" | "papers" | "articles" | "paths";
export type ShelfSort = "recent" | "highlighted" | "title" | "added";

export const SHELF_FILTERS: readonly ShelfFilter[] = ["all", "books", "papers", "articles", "paths"];
export const SHELF_SORTS: readonly ShelfSort[] = ["recent", "highlighted", "title", "added"];

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
    /**
     * When it came into the vault (#744 FR-8): the file's creation, or an article's `created`. Absent
     * for a saved path, which is not a file.
     */
    added?: number;
    /** An article's site (#744), its byline when nobody signed it. */
    host?: string;
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
    /** When the file came into the vault (its ctime). */
    added?: number;
}

/**
 * An article (#744): a note in the articles folder whose `source` is a web address, with what its
 * own frontmatter says — read from the metadata cache, never from the file.
 */
export interface ShelfArticle {
    path: string;
    basename: string;
    details: BookDetails;
    host?: string;
    /** Web Clipper's `created`, else the file's ctime. */
    added: number;
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
    /** The articles (#744). */
    articles?: readonly ShelfArticle[];
}

/** What a file is called on the shelf before the file says otherwise: its name, tidied. */
export function titleFromName(basename: string): string {
    const name = basename.replace(/\.(pdf|epub|md)$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
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
            ...(source.added ? { added: source.added } : {}),
            ...(meta?.imageOnly ? { imageOnly: true } : {}),
            ...(pages ? { chapters: pages } : {}),
            ...(meta?.chapter !== undefined ? { place: meta.chapter } : {}),
            ...(status ? { status } : {}),
            ...(note ? { note: note.path, details: note.details } : {}),
            ...(details?.collections ? { collections: [...details.collections] } : {}),
            ...(details?.series ? { series: details.series } : {}),
        });
    }
    for (const article of inputs.articles ?? []) {
        // Its own frontmatter is its note (FR-4): the status and collections are written there too.
        const meta = inputs.meta[article.path];
        const details = article.details;
        const author = details.author?.join(", ") ?? article.host;
        const status = effectiveStatus(details, meta);
        items.push({
            id: article.path,
            kind: "article",
            format: "article",
            title: details.title ?? titleFromName(article.basename),
            ...(author ? { author } : {}),
            file: article.path,
            progress: progressOf(meta),
            highlights: inputs.highlights.get(article.path) ?? 0,
            born: inputs.born.get(article.path) ?? 0,
            lastRead: meta?.at ?? 0,
            ...(article.added ? { added: article.added } : {}),
            ...(article.host ? { host: article.host } : {}),
            ...(meta?.chapters ? { chapters: meta.chapters } : {}),
            ...(meta?.chapter !== undefined ? { place: meta.chapter } : {}),
            ...(status ? { status } : {}),
            note: article.path,
            details,
            ...(details.collections ? { collections: [...details.collections] } : {}),
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
    (filter === "articles" && item.kind === "article") ||
    (filter === "paths" && item.kind === "path");

/** How many items each filter would show, before the search. */
export function shelfCounts(items: readonly ShelfItem[]): Record<ShelfFilter, number> {
    const counts: Record<ShelfFilter, number> = { all: items.length, books: 0, papers: 0, articles: 0, paths: 0 };
    for (const item of items) {
        if (item.kind === "book") counts.books++;
        else if (item.kind === "paper") counts.papers++;
        else if (item.kind === "article") counts.articles++;
        else counts.paths++;
    }
    return counts;
}

/** A status shelf (#819, #820): a status — or `none`, *On the shelf*, a book nothing is said of yet. */
export type StatusFilter = "all" | BookStatus | "none";
/** The status shelves in the order they stand: Reading, Want to read, On the shelf, Finished. */
export const STATUS_FILTERS: readonly StatusFilter[] = ["all", "reading", "to-read", "none", "finished"];

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

/** Whether the search finds an item (#865 FR-14): the shelf's own reading, for the archive's drawers. */
export function matchesSearch(item: ShelfItem, search: string): boolean {
    const needle = fold(search.trim());
    return !needle || haystack(item).includes(needle);
}

/** The shelf as asked for: one filter, a status, a collection, a search, one order. */
export function viewShelf(items: readonly ShelfItem[], query: ShelfQuery): ShelfItem[] {
    const needle = fold(query.search.trim());
    const status = query.status ?? "all";
    const collection = query.collection ? fold(query.collection) : null;
    const shown = items.filter(
        (item) =>
            matchesFilter(item, query.filter) &&
            (status === "all" || (status === "none" ? !item.status : item.status === status)) &&
            (!collection || (item.collections ?? []).some((name) => fold(name) === collection)) &&
            (!needle || haystack(item).includes(needle))
    );
    const byTitle = (a: ShelfItem, b: ShelfItem) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
    if (query.sort === "title") return shown.sort(byTitle);
    // Newest first (#744 FR-9); what is not a file — a saved path — after, by title.
    if (query.sort === "added") return shown.sort((a, b) => (b.added ?? 0) - (a.added ?? 0) || byTitle(a, b));
    if (query.sort === "highlighted") return shown.sort((a, b) => b.highlights - a.highlights || b.lastRead - a.lastRead || byTitle(a, b));
    // Recently read first; never-opened things after, by title, so a new book is easy to find.
    return shown.sort((a, b) => b.lastRead - a.lastRead || byTitle(a, b));
}

/** How many books lie open on the desk (#820): what you are reading now, never the whole pile. */
export const DESK_LIMIT = 2;

/** A status shelf (#820): Reading, Want to read, On the shelf or Finished. */
export type ShelfStatus = Exclude<StatusFilter, "all">;

/** One shelf of the Library: a status shelf, or one of yours (#821). */
export interface ShelfRow {
    /** `status:<status>` or `own:<folded name>` — what the shelf is known by across a redraw. */
    key: string;
    status?: ShelfStatus;
    /** Your shelf's name, as you spelt it. */
    own?: string;
    items: ShelfItem[];
}

export interface ShelfLayout {
    /** What you are reading now — open on the desk, and on no shelf. */
    desk: ShelfItem[];
    /** The status shelves in the order they stand, each holding something; then yours, A→Z. */
    shelves: ShelfRow[];
}

const statusRow = (status: ShelfStatus, items: ShelfItem[]): ShelfRow => ({ key: `status:${status}`, status, items });
const ownRow = (name: string, items: ShelfItem[]): ShelfRow => ({ key: `own:${fold(name)}`, own: name, items });

/**
 * **Where every book stands** (#820, #821): one pass over the shelf as asked for. What you were last
 * in and have not finished lies open on the desk — up to two, most recent first, and only while
 * nothing narrows the shelf to one status or one shelf. Every other book stands in one place: on its
 * first shelf of yours, else on the shelf of its status — *On the shelf* when nothing is said of it.
 *
 * `own` is every shelf of yours (see `yourShelves`): one you made and left empty still stands, with
 * room for books, while nothing narrows the view. Narrowed to a status, every book of that status is
 * on one shelf, wherever it stands otherwise; narrowed to a shelf of yours, every book on it.
 */
export function layShelves(items: readonly ShelfItem[], query: ShelfQuery, own: readonly string[] = []): ShelfLayout {
    const shown = viewShelf(items, query);
    const status = query.status ?? "all";
    if (query.collection) {
        const wanted = fold(query.collection);
        const name = own.find((candidate) => fold(candidate) === wanted) ?? shown.flatMap((item) => item.collections ?? []).find((candidate) => fold(candidate) === wanted) ?? query.collection;
        return { desk: [], shelves: shown.length > 0 || !query.search.trim() ? [ownRow(name, shown)] : [] };
    }
    if (status !== "all") return { desk: [], shelves: shown.length > 0 ? [statusRow(status, shown)] : [] };
    const desk = shown
        .filter((item) => item.lastRead > 0 && item.progress < 1 && item.status !== "finished" && item.status !== "to-read")
        .sort((a, b) => b.lastRead - a.lastRead)
        .slice(0, DESK_LIMIT);
    const onDesk = new Set(desk.map((item) => item.id));
    const byStatus = new Map<ShelfStatus, ShelfItem[]>();
    const byOwn = new Map<string, ShelfItem[]>();
    for (const item of shown) {
        if (onDesk.has(item.id)) continue;
        const first = item.collections?.[0];
        if (first) {
            const key = fold(first);
            const row = byOwn.get(key);
            if (row) row.push(item);
            else byOwn.set(key, [item]);
            continue;
        }
        const place: ShelfStatus = item.status ?? "none";
        const row = byStatus.get(place);
        if (row) row.push(item);
        else byStatus.set(place, [item]);
    }
    const shelves = STATUS_FILTERS.filter((place): place is ShelfStatus => place !== "all" && byStatus.has(place)).map((place) => statusRow(place, byStatus.get(place) ?? []));
    // Yours, A→Z: every one with a book here — and, while nothing narrows the view, the empty ones too.
    const quiet = query.filter === "all" && !query.search.trim();
    const names = new Map<string, string>();
    for (const name of own) names.set(fold(name), name);
    for (const item of shown) {
        const first = item.collections?.[0];
        if (first && !names.has(fold(first)) && !onDesk.has(item.id)) names.set(fold(first), first);
    }
    for (const name of [...names.values()].sort((a, b) => a.localeCompare(b))) {
        const row = byOwn.get(fold(name)) ?? [];
        if (row.length > 0 || quiet) shelves.push(ownRow(name, row));
    }
    return { desk, shelves };
}

/** Where a book stands in a layout: on the desk, or which shelf — and how far along it. */
function standing(layout: ShelfLayout, id: string): string | null {
    const desk = layout.desk.findIndex((item) => item.id === id);
    if (desk >= 0) return `desk:${desk}`;
    for (const row of layout.shelves) {
        const at = row.items.findIndex((item) => item.id === id);
        if (at >= 0) return `${row.key}:${at}`;
    }
    return null;
}

/**
 * Whether opening book `id` now leaves it where it stands (#829): read `now`, given the status the
 * open sets, it is laid out in the same place. The close shot films toward that place at once — and
 * waits for the Library to draw the book when it has moved (the top of the desk, a new status).
 */
export function staysOnOpen(items: readonly ShelfItem[], query: ShelfQuery, own: readonly string[], id: string, now: number, status?: ShelfItem["status"]): boolean {
    const before = standing(layShelves(items, query, own), id);
    if (!before) return false;
    const opened = items.map((item) => (item.id === id ? { ...item, lastRead: now, ...(status ? { status } : {}) } : item));
    return standing(layShelves(opened, query, own), id) === before;
}

/** How the Library shows its books (#819, #820): covers, or spines on the shelf. */
export type BookView = "covers" | "spines";
export const BOOK_VIEWS: readonly BookView[] = ["covers", "spines"];

/** The saved value, read: anything but *spines* is covers. */
export function bookViewOf(value: unknown): BookView {
    return value === "spines" ? "spines" : "covers";
}

/** How many items each status chip would show (#743). */
export function statusCounts(items: readonly ShelfItem[]): Record<StatusFilter, number> {
    const counts: Record<StatusFilter, number> = { all: items.length, "to-read": 0, reading: 0, finished: 0, none: 0 };
    for (const item of items) counts[item.status ?? "none"]++;
    return counts;
}


/** One part of the detail's sentence (#822): what came of a source, and never a zero. */
export type DetailPart =
    | { kind: "read"; percent: number }
    | { kind: "started" }
    | { kind: "finished" }
    | { kind: "highlights"; n: number }
    | { kind: "born"; n: number };

/**
 * **The detail's one sentence** (#822): how far, how many marks, how many notes — only what is
 * there. A source never opened says nothing; a count of none is not said; opened but under one per
 * cent is *Started*, never *0% read*.
 */
export function detailSentenceParts(item: Pick<ShelfItem, "kind" | "progress" | "lastRead" | "place" | "highlights" | "born">): DetailPart[] {
    const parts: DetailPart[] = [];
    // A saved path's `lastRead` includes when it was saved: it was opened once it has a place.
    const opened = item.kind === "path" ? item.place !== undefined : item.lastRead > 0 || item.progress >= 1;
    if (opened) {
        const percent = Math.round(item.progress * 100);
        if (item.progress >= 1) parts.push({ kind: "finished" });
        else if (percent >= 1) parts.push({ kind: "read", percent });
        else parts.push({ kind: "started" });
    }
    if (item.highlights >= 1) parts.push({ kind: "highlights", n: item.highlights });
    if (item.kind !== "path" && item.born >= 1) parts.push({ kind: "born", n: item.born });
    return parts;
}
