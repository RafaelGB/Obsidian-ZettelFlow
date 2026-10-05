import type { ReaderKind } from "./readerContract";

/**
 * **Resume where you left off** (#669) — pure, over a small map kept in plugin data.
 *
 * A reading is known by how it was chosen: a kind and the note it started from, or — for a set you
 * picked — the set itself. Only the place is kept (the chapter, how many there were, when), never
 * anything about what you read, and only the most recent few readings.
 */
export interface ResumeEntry {
    chapter: number;
    total: number;
    at: number;
}

export type ResumeMap = Record<string, ResumeEntry>;

/** How many readings are remembered; the oldest is forgotten first. */
export const RESUME_LIMIT = 40;

/** A short, stable fingerprint of a picked set, so its key does not carry the paths themselves. */
function fingerprint(paths: readonly string[]): string {
    let hash = 5381;
    for (const ch of [...paths].sort().join("\n")) hash = ((hash << 5) + hash + ch.charCodeAt(0)) | 0;
    return (hash >>> 0).toString(36);
}

/** The key a reading is remembered under. */
export function readingKey(kind: ReaderKind, seed: string, paths?: readonly string[]): string {
    return kind === "selection" && paths ? `selection:${fingerprint(paths)}` : `${kind}:${seed}`;
}

/** Remember where a reading is — or forget it once it reached the last chapter. */
export function recordResume(map: ResumeMap, key: string, chapter: number, total: number, now: number): ResumeMap {
    const next: ResumeMap = { ...map };
    if (chapter <= 0 || chapter >= total - 1) delete next[key];
    else next[key] = { chapter, total, at: now };
    const keys = Object.keys(next);
    if (keys.length > RESUME_LIMIT) {
        keys.sort((a, b) => next[a].at - next[b].at)
            .slice(0, keys.length - RESUME_LIMIT)
            .forEach((key) => delete next[key]);
    }
    return next;
}

/** The place a reading was left at, when there is one worth offering. */
export function resumeOf(map: ResumeMap | undefined, key: string): ResumeEntry | null {
    const entry = map?.[key];
    return entry && entry.chapter > 0 && entry.chapter < entry.total ? entry : null;
}

/** Read a stored map, keeping only well-formed entries. Never throws. */
export function normalizeResume(raw: unknown): ResumeMap {
    if (raw === null || typeof raw !== "object") return {};
    const out: ResumeMap = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        const v = value as Record<string, unknown> | null;
        if (v && typeof v.chapter === "number" && typeof v.total === "number" && typeof v.at === "number") {
            out[key] = { chapter: v.chapter, total: v.total, at: v.at };
        }
    }
    return out;
}
