import type { KnowledgeModel } from "../model/KnowledgeModel";
import { computeWeeklyReview } from "../review/weeklyReview";
import { openGaps } from "../judgement/gapVerdict";
import type { Judgement } from "../judgement/Judgement";
import { openQuestions, type OpenQuestion } from "../questions/openQuestions";

const DAY_MS = 86_400_000;
const NEW_IDEAS_WINDOW_MS = 7 * DAY_MS;
const TOP_N = 5;

/** The narrative "front door" of the knowledge system (#172) — widgets composed from live state. */
export interface HomeModel {
    thinkingDays: number;
    newIdeas: string[];
    mainConcepts: string[];
    reviewDue: string[];
    /**
     * The **gaps**: pairs of your notes that share context and are not linked (#534).
     *
     * One name for one thing. The map calls this a gap and Home used to call it a *suggested
     * connection* — two names for one fact, and *suggested* was the surface deciding what you came
     * for. A row states what is true of the graph; what to do about it is yours.
     *
     * Only the ones you have not ruled out: a pair you called *not related* is gone from here and
     * from every other reader at once.
     */
    gaps: { a: string; b: string }[];
    /** How many fleeting notes are waiting to be developed — the #285 growth nudge. */
    fleetingCount: number;
    /** Up to TOP_N fleeting notes, newest first — the nudge links straight to the first one. */
    fleetingReady: string[];
    /**
     * What is asked and unanswered (#507, epic #504).
     *
     * It had a mode of its own in Discovery, which was the wrong surface: it is not a filter
     * over your vault, it is an answer to *what should I do next* — the question Home exists
     * for, and where the suggested connections beside it already were.
     */
    openQuestions: OpenQuestion[];
}

export interface BuildHomeOptions {
    /** Distinct active days from the development journal (#162) — read by the view, passed in. */
    thinkingDays: number;
    /** Now, for the recency/review windows — passed in so the pure fn stays reproducible. */
    now: number;
    /**
     * The judgement record (#534), for the gaps you have ruled out. Optional: a caller that passes
     * nothing gets the unfiltered gaps, which is what every pre-#534 caller got.
     */
    judgements?: readonly Judgement[];
}

const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Pure ZettelFlow Home aggregate (#172, AC-1). Composes existing State-layer functions into the
 * home widgets: `newIdeas` (created in the last 7 days, newest first), `mainConcepts` (best-connected
 * notes), `reviewDue` (the #160 weekly review's stale-important hubs), `gaps` (the #163 discoveries,
 * minus what you ruled out) and `fleeting` (the #285 growth nudge) — plus the `thinkingDays` echoed from the
 * journal. "What to work on next" is centralized in Cultivate (#313), not a separate widget here.
 * Deterministic, read-only, never throws; an empty model yields a well-defined empty home.
 * Obsidian-free (the view supplies `thinkingDays`/`now`).
 */
export function buildHome(model: KnowledgeModel, opts: BuildHomeOptions): HomeModel {
    const { thinkingDays, now, judgements } = opts;
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

    // TOP_N, not the default three: `findDiscoveries` is bound to a display limit of three, so this
    // section showed three rows however many gaps a vault had, and the `slice(0, TOP_N)` beside it
    // read as if it showed five. Five is what it says it shows (#530 left this one behind).
    const gaps = openGaps(model, judgements ?? [], TOP_N).map((gap) => ({ a: gap.a, b: gap.b }));

    const unanswered = openQuestions(model).slice(0, TOP_N);

    const fleeting = all
        .filter((idea) => idea.state === "fleeting")
        .sort((a, b) => b.created - a.created || byPath(a.path, b.path));
    const fleetingReady = fleeting.slice(0, TOP_N).map((idea) => idea.path);

    return {
        thinkingDays,
        newIdeas,
        mainConcepts,
        reviewDue,
        gaps,
        fleetingCount: fleeting.length,
        fleetingReady,
        openQuestions: unanswered,
    };
}
