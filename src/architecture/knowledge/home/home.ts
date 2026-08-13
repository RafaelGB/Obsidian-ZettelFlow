import type { KnowledgeModel } from "../model/KnowledgeModel";
import { computeWeeklyReview } from "../review/weeklyReview";
import { findDiscoveries } from "../discovery/discoveries";
import { NextSession, nextSession } from "./nextSession";

const DAY_MS = 86_400_000;
const NEW_IDEAS_WINDOW_MS = 7 * DAY_MS;
const TOP_N = 5;

/** The narrative "front door" of the knowledge system (#172) — widgets composed from live state. */
export interface HomeModel {
    thinkingDays: number;
    newIdeas: string[];
    mainConcepts: string[];
    reviewDue: string[];
    suggestedConnections: { a: string; b: string }[];
    nextSession: NextSession | null;
}

export interface BuildHomeOptions {
    /** Distinct active days from the development journal (#162) — read by the view, passed in. */
    thinkingDays: number;
    /** Now, for the recency/review windows — passed in so the pure fn stays reproducible. */
    now: number;
}

const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Pure ZettelFlow Home aggregate (#172, AC-1). Composes existing State-layer functions into the
 * home widgets: `newIdeas` (created in the last 7 days, newest first), `mainConcepts` (best-connected
 * notes), `reviewDue` (the #160 weekly review's stale-important hubs), `suggestedConnections` (the
 * #163 discoveries), and the new `nextSession` heuristic — plus the `thinkingDays` echoed from the
 * journal. Deterministic, read-only, never throws; an empty model yields a well-defined empty home.
 * Obsidian-free (the view supplies `thinkingDays`/`now`).
 */
export function buildHome(model: KnowledgeModel, opts: BuildHomeOptions): HomeModel {
    const { thinkingDays, now } = opts;
    const all = model.all();

    const newIdeas = all
        .filter((idea) => idea.created >= now - NEW_IDEAS_WINDOW_MS)
        .sort((a, b) => b.created - a.created || byPath(a.path, b.path))
        .slice(0, TOP_N)
        .map((idea) => idea.path);

    const mainConcepts = all
        .filter((idea) => idea.maturitySignals.degree >= 1)
        .sort((a, b) => b.maturitySignals.degree - a.maturitySignals.degree || byPath(a.path, b.path))
        .slice(0, TOP_N)
        .map((idea) => idea.path);

    const important = computeWeeklyReview(model, now).sections.find((section) => section.key === "important");
    const reviewDue = (important?.paths ?? []).slice(0, TOP_N);

    const suggestedConnections = findDiscoveries(model)
        .slice(0, TOP_N)
        .map((discovery) => ({ a: discovery.a, b: discovery.b }));

    return {
        thinkingDays,
        newIdeas,
        mainConcepts,
        reviewDue,
        suggestedConnections,
        nextSession: nextSession(model),
    };
}
