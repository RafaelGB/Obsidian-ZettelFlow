import type { KnowledgeModel } from "../model/KnowledgeModel";
import type { Idea } from "../model/Idea";
import { notesWithNoIncoming, hubs } from "../query/queries";

/** The four digest sections of a weekly review (#160). */
export type ReviewSectionKey = "created" | "orphans" | "forgotten" | "important";

/** The next action a section nudges toward. */
export type ReviewAction = "open" | "connect" | "review";

export interface ReviewSection {
    key: ReviewSectionKey;
    count: number;
    /** Affected note paths (created/orphans/important: path asc; forgotten: oldest `modified` first). */
    paths: string[];
    action: ReviewAction;
}

export interface WeeklyReview {
    windowDays: number;
    sections: ReviewSection[];
}

export const DAY_MS = 86_400_000;
export const DEFAULT_WINDOW_DAYS = 7;
/** A note untouched for this many days counts as "forgotten"/stale. */
export const STALE_DAYS = 30;
/** Cap the forgotten list so the digest stays skimmable. */
export const FORGOTTEN_CAP = 10;
/** Degree at/above which a note is a hub. */
export const HUB_THRESHOLD = 5;

const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const sortedPaths = (ideas: Idea[]): string[] => ideas.map((idea) => idea.path).sort(byPath);

/**
 * Pure weekly-review aggregate (#160). Over a rolling `windowDays`-day window ending at `now`,
 * returns four sections from the model: **created** (notes created in the window), **orphans**
 * (nothing links to them), **forgotten** (untouched for ≥ {@link STALE_DAYS}, oldest first, capped),
 * and **important** (hubs that are also stale). Deterministic, read-only, never throws; an empty
 * model yields all-zero sections. Reads only the {@link KnowledgeModel}; Obsidian-free.
 */
export function computeWeeklyReview(
    model: KnowledgeModel,
    now: number,
    windowDays: number = DEFAULT_WINDOW_DAYS
): WeeklyReview {
    const windowStart = now - windowDays * DAY_MS;
    const staleBefore = now - STALE_DAYS * DAY_MS;
    const all = model.all();

    const created = all.filter((idea) => idea.created > windowStart && idea.created <= now);
    const orphans = notesWithNoIncoming(model);
    const forgotten = all
        .filter((idea) => idea.modified < staleBefore)
        .sort((a, b) => a.modified - b.modified || byPath(a.path, b.path))
        .slice(0, FORGOTTEN_CAP);
    const hubPaths = new Set(hubs(model, HUB_THRESHOLD).map((idea) => idea.path));
    const important = all.filter((idea) => hubPaths.has(idea.path) && idea.modified < staleBefore);

    const sections: ReviewSection[] = [
        { key: "created", count: created.length, paths: sortedPaths(created), action: "review" },
        { key: "orphans", count: orphans.length, paths: sortedPaths(orphans), action: "connect" },
        { key: "forgotten", count: forgotten.length, paths: forgotten.map((idea) => idea.path), action: "review" },
        { key: "important", count: important.length, paths: sortedPaths(important), action: "review" },
    ];
    return { windowDays, sections };
}
