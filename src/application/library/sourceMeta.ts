/**
 * **What the Library remembers about a source** (#680, epic #675) — pure, over a small map kept
 * in plugin data.
 *
 * A source is a PDF or an EPUB already in your vault (L1). The file is never written (L5), so
 * what the shelf shows that the file itself cannot say cheaply lives here: its title and author
 * as the file declares them, how many chapters it has (pages, or spine items), whether a PDF is
 * made only of images, and where you are in it.
 *
 * The facts are kept **with the fingerprint they were read from** (size and modification time):
 * replace the file and they are read again, but your place in it is kept. Nothing about what you
 * read is stored here — that is Think's job, as thoughts you can open.
 */

import { normalizeBookmarks, type Bookmark } from "architecture/components/core/reader/readerBookmarks";
import { normalizePageView, type PageViewState } from "architecture/components/core/library/sources/pdfPageView";

export type SourceFormat = "pdf" | "epub";

export interface SourceMeta {
    /** The file this was read from: its size and modification time. */
    size: number;
    mtime: number;
    /** What the file declares, when it declares it. */
    title?: string;
    author?: string;
    /** Pages for a PDF, spine items for an EPUB. */
    chapters?: number;
    /** A PDF with no text layer: it can be read, never highlighted (owner, 2026-10-06). */
    imageOnly?: boolean;
    /** The chapter you were last on, and when. */
    chapter?: number;
    /** How far into that chapter you were, as a share of it (0–1): where a resume lands. */
    scroll?: number;
    at?: number;
    /** You reached the end at least once. */
    done?: boolean;
    /** The places you bookmarked (#761): places, never thoughts — kept beside where you are. */
    bookmarks?: Bookmark[];
    /**
     * How a paper is read in Page view (#767 FR-5, FR-9): its zoom or fit, Down or Across, and the
     * pages you turned. Kept here, beside its place — the PDF itself is never written.
     */
    view?: PageViewState;
}

export type LibraryMeta = Record<string, SourceMeta>;

/** How many sources are remembered; the least recently touched is forgotten first. */
export const LIBRARY_LIMIT = 2000;

/** Whether a vault path is a source the Library reads, and which kind. */
export function sourceFormat(path: string): SourceFormat | null {
    const lower = path.toLowerCase();
    if (lower.endsWith(".pdf")) return "pdf";
    if (lower.endsWith(".epub")) return "epub";
    return null;
}

/** A BCP 47 shape, as the chapter sanitiser keeps it: letters, then dash-separated parts. */
const LANGUAGE_TAG = /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/;

/**
 * A language a source declares (#757): an EPUB's `dc:language`, a PDF's `/Lang`. The tag, trimmed,
 * or nothing for a value that is not one.
 */
export function languageTag(raw: unknown): string | undefined {
    if (typeof raw !== "string") return undefined;
    const tag = raw.trim();
    return LANGUAGE_TAG.test(tag) ? tag : undefined;
}

const num = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** Read a stored map, keeping only well-formed entries. Never throws. */
export function normalizeLibrary(raw: unknown): LibraryMeta {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: LibraryMeta = {};
    for (const [path, value] of Object.entries(raw as Record<string, unknown>)) {
        const v = value as Record<string, unknown> | null;
        if (!v || !sourceFormat(path) || !num(v.size) || !num(v.mtime)) continue;
        const meta: SourceMeta = { size: v.size, mtime: v.mtime };
        if (text(v.title)) meta.title = v.title.trim();
        if (text(v.author)) meta.author = v.author.trim();
        if (num(v.chapters) && v.chapters > 0) meta.chapters = Math.round(v.chapters);
        if (v.imageOnly === true) meta.imageOnly = true;
        if (num(v.chapter) && v.chapter >= 0) meta.chapter = Math.round(v.chapter);
        if (num(v.scroll) && v.scroll >= 0 && v.scroll <= 1) meta.scroll = v.scroll;
        if (num(v.at) && v.at > 0) meta.at = v.at;
        if (v.done === true) meta.done = true;
        const bookmarks = normalizeBookmarks(v.bookmarks);
        if (bookmarks.length > 0) meta.bookmarks = bookmarks;
        const view = normalizePageView(v.view);
        if (Object.keys(view).length > 0) meta.view = view;
        out[path] = meta;
    }
    return out;
}

/** Whether the facts were read from this very file, or it changed since. */
export function isFresh(meta: SourceMeta | undefined, size: number, mtime: number): boolean {
    return Boolean(meta && meta.size === size && meta.mtime === mtime && meta.chapters !== undefined);
}

/** What reading a file tells the shelf. */
export interface SourceFacts {
    title?: string;
    author?: string;
    chapters: number;
    imageOnly?: boolean;
}

/** Keep what was read from a file, with its fingerprint. Your place in it is kept. */
export function withFacts(map: LibraryMeta, path: string, facts: SourceFacts, size: number, mtime: number): LibraryMeta {
    const previous = map[path];
    const next: SourceMeta = { size, mtime, chapters: Math.max(1, Math.round(facts.chapters)) };
    if (text(facts.title)) next.title = facts.title.trim();
    if (text(facts.author)) next.author = facts.author.trim();
    if (facts.imageOnly) next.imageOnly = true;
    if (previous?.chapter !== undefined) next.chapter = Math.min(previous.chapter, next.chapters! - 1);
    if (previous?.at) next.at = previous.at;
    if (previous?.done) next.done = true;
    // A new copy of the book keeps its bookmarks, as it keeps its place (#761 FR-2).
    if (previous?.bookmarks?.length) next.bookmarks = previous.bookmarks;
    // And how you read it in Page view (#767).
    if (previous?.view) next.view = previous.view;
    return prune({ ...map, [path]: next });
}

/** How the paper is read in Page view, replaced by `view` (#767). The default leaves no field behind. */
export function withPageView(map: LibraryMeta, path: string, view: PageViewState, size = 0, mtime = 0): LibraryMeta {
    const previous: SourceMeta = { ...(map[path] ?? { size, mtime }) };
    delete previous.view;
    const clean = normalizePageView(view);
    // Measured frames carry the fingerprint of the file they were measured on (#769 FR-6).
    if (clean.cropFrames && (size || mtime)) clean.cropFrames = { ...clean.cropFrames, size, mtime };
    const next: SourceMeta = Object.keys(clean).length > 0 ? { ...previous, view: clean } : previous;
    return prune({ ...map, [path]: next });
}

/**
 * How the paper is read in Page view, for the file as it is now (#769): frames measured on another
 * copy of it — a different size or modification time — are left out, so the paper is measured again.
 */
export function freshPageView(view: PageViewState | undefined, size: number, mtime: number): PageViewState {
    const clean = normalizePageView(view);
    const frames = clean.cropFrames;
    if (frames && (frames.size !== size || frames.mtime !== mtime)) delete clean.cropFrames;
    return clean;
}

/** The book's bookmarks, replaced by `list` (#761). An empty list leaves no field behind. */
export function withBookmarks(map: LibraryMeta, path: string, list: readonly Bookmark[], size = 0, mtime = 0): LibraryMeta {
    const previous: SourceMeta = { ...(map[path] ?? { size, mtime }) };
    delete previous.bookmarks;
    const next: SourceMeta = list.length > 0 ? { ...previous, bookmarks: [...list] } : previous;
    return prune({ ...map, [path]: next });
}

/** Remember where you are in a source. The last chapter marks it read, and stays read. */
export function withPlace(map: LibraryMeta, path: string, chapter: number, total: number, now: number, size = 0, mtime = 0): LibraryMeta {
    const previous = map[path] ?? { size, mtime };
    const last = Math.max(1, total) - 1;
    const at = Math.max(0, Math.min(chapter, last));
    // Another chapter starts at its top: the share kept belonged to the one you left.
    const { scroll, ...kept } = previous;
    const next: SourceMeta = {
        ...kept,
        ...(scroll !== undefined && previous.chapter === at ? { scroll } : {}),
        chapters: previous.chapters ?? Math.max(1, total),
        chapter: at,
        at: now,
        ...(chapter >= last || previous.done ? { done: true } : {}),
    };
    return prune({ ...map, [path]: next });
}

/** How far into the chapter you are, kept for a resume — only for the chapter the place says you are on. */
export function withScroll(map: LibraryMeta, path: string, chapter: number, share: number): LibraryMeta {
    const previous = map[path];
    if (!previous || previous.chapter !== chapter || !(share >= 0 && share <= 1)) return map;
    return { ...map, [path]: { ...previous, scroll: Math.round(share * 1000) / 1000 } };
}

/** The scroll position for a kept share of a chapter, on the page as tall as it is now. */
export function resumeScroll(share: number, scrollHeight: number, clientHeight: number): number {
    const room = scrollHeight - clientHeight;
    return room > 0 ? Math.round(share * room) : 0;
}

/** A source renamed in the vault keeps everything the Library knew about it. */
export function renameSource(map: LibraryMeta, from: string, to: string): LibraryMeta {
    if (!map[from] || !sourceFormat(to)) return map;
    const next = { ...map, [to]: map[from] };
    delete next[from];
    return next;
}

/** Forget sources that left the vault. */
export function forgetMissing(map: LibraryMeta, present: ReadonlySet<string>): LibraryMeta {
    const next: LibraryMeta = {};
    for (const [path, meta] of Object.entries(map)) if (present.has(path)) next[path] = meta;
    return next;
}

/** How far through a source you are, 0 to 1. A source you finished reads as finished. */
export function progressOf(meta: SourceMeta | undefined): number {
    if (!meta || meta.chapter === undefined || !meta.chapters) return meta?.done ? 1 : 0;
    if (meta.done && meta.chapter >= meta.chapters - 1) return 1;
    return Math.max(0, Math.min(1, (meta.chapter + 1) / meta.chapters));
}

function prune(map: LibraryMeta): LibraryMeta {
    const keys = Object.keys(map);
    if (keys.length <= LIBRARY_LIMIT) return map;
    const next = { ...map };
    keys.sort((a, b) => (next[a].at ?? 0) - (next[b].at ?? 0))
        .slice(0, keys.length - LIBRARY_LIMIT)
        .forEach((key) => delete next[key]);
    return next;
}
