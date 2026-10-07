import { normalizeResume, readingKey } from "architecture/components/core/reader/readerResume";
import { normalizeSaved } from "architecture/components/core/reader/readerSaved";
import { READING_KINDS, type ReaderKind } from "architecture/components/core/reader/readerContract";
import { normalizeLibrary } from "application/library/sourceMeta";

/**
 * **The reading in progress** (#703, epic #701) — one of the three cards under *Where you left off*.
 *
 * The Reader keeps its places in three lists: a note reading by `kind:seed`, a picked set by the
 * fingerprint of its notes (named only when you saved it), and a PDF or EPUB on its shelf entry.
 * This answers one question over all three — *what was I last reading, and where?* — so Home can
 * offer it in one click. Pure: settings in, a place out.
 */
export interface ReadingInProgress {
    title: string;
    /** The chapter you were on, 0-based, and how many there are. */
    chapter: number;
    total: number;
    at: number;
    /** How to open it again: a note reading, a saved set, or a source on the shelf. */
    open:
        | { kind: "note"; seed: string; reading: ReaderKind }
        | { kind: "saved"; seed: string; paths: string[]; name: string }
        | { kind: "source"; path: string };
}

function basename(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.(md|pdf|epub)$/i, "");
}

const KINDS = new Set<string>(READING_KINDS);

/** The most recent unfinished reading across notes, saved sets and the shelf, or `null`. */
export function readingInProgress(settings: {
    readerResume?: unknown;
    readerSaved?: unknown;
    library?: unknown;
} | null | undefined): ReadingInProgress | null {
    if (!settings) return null;
    const candidates: ReadingInProgress[] = [];

    const resume = normalizeResume(settings.readerResume);
    const saved = normalizeSaved(settings.readerSaved);
    const savedByKey = new Map(saved.map((entry) => [readingKey("selection", entry.seed, entry.paths), entry]));
    for (const [key, place] of Object.entries(resume)) {
        if (place.chapter <= 0 || place.chapter >= place.total) continue;
        const named = savedByKey.get(key);
        if (named) {
            candidates.push({
                title: named.name,
                chapter: place.chapter,
                total: place.total,
                at: place.at,
                open: { kind: "saved", seed: named.seed, paths: named.paths, name: named.name },
            });
            continue;
        }
        const colon = key.indexOf(":");
        const kind = key.slice(0, colon);
        const seed = key.slice(colon + 1);
        // An unnamed picked set cannot be rebuilt from its fingerprint — it is not offered.
        if (colon <= 0 || !seed || kind === "selection" || !KINDS.has(kind)) continue;
        candidates.push({
            title: basename(seed),
            chapter: place.chapter,
            total: place.total,
            at: place.at,
            open: { kind: "note", seed, reading: kind as ReaderKind },
        });
    }

    for (const [path, meta] of Object.entries(normalizeLibrary(settings.library))) {
        if (meta.done || !meta.at || !meta.chapters || meta.chapter === undefined || meta.chapter <= 0) continue;
        candidates.push({
            title: meta.title ?? basename(path),
            chapter: meta.chapter,
            total: meta.chapters,
            at: meta.at,
            open: { kind: "source", path },
        });
    }

    candidates.sort((a, b) => b.at - a.at);
    return candidates[0] ?? null;
}
