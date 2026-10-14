import { tutorialsInTracks, type LearnCatalog, type Track, type Tutorial } from "./learnCatalog";

/**
 * **What you have learned here** (#802 FR-2, FR-12) — pure.
 *
 * Progress is a fact, never a grade: the tutorials you marked done, and the one you opened last. It
 * lives in `data.json` (`learnProgress`), so it follows the vault to your other devices; it is
 * mechanical (§XII) and is not configuration, so it has no form (§XIII). Everything is counted over
 * the tutorials the tracks show — one about a newer plugin is not in the catalog at all (S4), and so
 * not in the denominator either.
 */
export interface LearnProgress {
    done: string[];
    last?: string;
}

export const NO_PROGRESS: LearnProgress = { done: [] };

/** The record as `data.json` holds it, read defensively: a hand edit is as good as nothing. */
export function readProgress(raw: unknown): LearnProgress {
    if (!raw || typeof raw !== "object") return { done: [] };
    const value = raw as Partial<Record<keyof LearnProgress, unknown>>;
    const done = Array.isArray(value.done) ? [...new Set(value.done.filter((id): id is string => typeof id === "string"))] : [];
    return typeof value.last === "string" ? { done, last: value.last } : { done };
}

/** The same record with one tutorial done, or not. */
export function withDone(progress: LearnProgress, id: string, done: boolean): LearnProgress {
    const rest = progress.done.filter((one) => one !== id);
    return { ...progress, done: done ? [...rest, id] : rest };
}

/** The same record, with `id` as the tutorial opened last. */
export function withLast(progress: LearnProgress, id: string): LearnProgress {
    return { ...progress, last: id };
}

export function isDone(progress: LearnProgress, id: string): boolean {
    return progress.done.includes(id);
}

/** The ring: how many of the tutorials shown are done. */
export function ring(catalog: LearnCatalog, progress: LearnProgress): { done: number; total: number } {
    const all = tutorialsInTracks(catalog);
    const done = new Set(progress.done);
    return { done: all.filter((tutorial) => done.has(tutorial.id)).length, total: all.length };
}

/** One track's bar: `d/n`. */
export function trackProgress(catalog: LearnCatalog, track: Track, progress: LearnProgress): { done: number; total: number } {
    const ids = track.tutorials.filter((id) => catalog.tutorials[id]);
    return { done: ids.filter((id) => isDone(progress, id)).length, total: ids.length };
}

export type NextUp =
    /** Nothing done and nothing opened: the first tutorial of the first track. */
    | { state: "start"; tutorial: Tutorial }
    /** The last one opened, if it is not done; else the first not done, in track order. */
    | { state: "pick-up"; tutorial: Tutorial }
    | { state: "all-done" };

export function nextUp(catalog: LearnCatalog, progress: LearnProgress): NextUp {
    const all = tutorialsInTracks(catalog);
    const open = all.filter((tutorial) => !isDone(progress, tutorial.id));
    if (open.length === 0) return { state: "all-done" };
    const last = open.find((tutorial) => tutorial.id === progress.last);
    const started = progress.done.some((id) => catalog.tutorials[id]) || !!last;
    if (!started) return { state: "start", tutorial: open[0] };
    return { state: "pick-up", tutorial: last ?? open[0] };
}

/** The track a tutorial is in. */
export function trackOf(catalog: LearnCatalog, id: string): Track | null {
    return catalog.tracks.find((track) => track.tutorials.includes(id)) ?? null;
}

/** *Up next*: the next tutorial in its track, else the first of the next track; none after the last. */
export function upNext(catalog: LearnCatalog, id: string): Tutorial | null {
    const all = tutorialsInTracks(catalog);
    const at = all.findIndex((tutorial) => tutorial.id === id);
    return at >= 0 ? (all[at + 1] ?? null) : null;
}

/** The starter chips: the first tutorial of each of the first five tracks. */
export function starters(catalog: LearnCatalog, max = 5): Tutorial[] {
    return catalog.tracks
        .slice(0, max)
        .map((track) => catalog.tutorials[track.tutorials[0]])
        .filter((tutorial): tutorial is Tutorial => !!tutorial);
}

/**
 * The film a lesson's camera travels down (FR-10): one frame per **picture**, not per step. A step
 * with its own image moves the camera to it; a step without one keeps the frame before, so the
 * camera holds still. The first frame is the first step's image, else the tutorial's hero.
 */
export function filmOf(tutorial: Tutorial): { frames: string[]; at: number[] } {
    const frames: string[] = [];
    const at: number[] = [];
    tutorial.steps.forEach((step, i) => {
        const image = step.image ?? (i === 0 ? tutorial.hero : undefined);
        if (image && image !== frames[frames.length - 1]) frames.push(image);
        at.push(Math.max(0, frames.length - 1));
    });
    return { frames, at };
}
