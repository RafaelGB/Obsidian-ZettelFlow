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
    at?: number;
    /** You reached the end at least once. */
    done?: boolean;
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
        if (num(v.at) && v.at > 0) meta.at = v.at;
        if (v.done === true) meta.done = true;
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
    return prune({ ...map, [path]: next });
}

/** Remember where you are in a source. The last chapter marks it read, and stays read. */
export function withPlace(map: LibraryMeta, path: string, chapter: number, total: number, now: number, size = 0, mtime = 0): LibraryMeta {
    const previous = map[path] ?? { size, mtime };
    const last = Math.max(1, total) - 1;
    const next: SourceMeta = {
        ...previous,
        chapters: previous.chapters ?? Math.max(1, total),
        chapter: Math.max(0, Math.min(chapter, last)),
        at: now,
        ...(chapter >= last || previous.done ? { done: true } : {}),
    };
    return prune({ ...map, [path]: next });
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
