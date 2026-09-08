import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { lastJudgementFor } from "architecture/knowledge/judgement/judgementQueries";
import { UNEXAMINED_MIN_DEGREE } from "architecture/knowledge/judgement/unexamined";
import type { Judgement } from "architecture/knowledge/judgement/Judgement";

/**
 * Idea **trajectory** (#364, D4) — the read side of the manifesto's question *"has my understanding
 * changed, or has my vault just grown?"*. Lifecycle tells you an idea's *state*; this tells you its
 * *direction*: is it moving, or has it stalled?
 *
 * "Movement" here is **cognitive**, not structural — a recorded verdict (#336), the thing that is scarce.
 * An idea can accrue links and claims for weeks; that is growth, not thought. So an idea that is
 * structurally *important* (well connected) but carries no recent judgement is **stalled**, and one you
 * ruled on lately is **advancing**. Pure, deterministic (inject `now`), offline. It returns **ideas and
 * a direction** — never a number about you: no score, no ratio, no grade (§XI: metrics are consequences).
 */

/** Which way an idea is moving, by how recently you exercised judgement over it. */
export type TrajectoryDirection = "advancing" | "steady" | "stalled";

/** One important idea and its cognitive direction. */
export interface IdeaTrajectory {
    path: string;
    direction: TrajectoryDirection;
    /** When the idea last received a verdict (cognitive movement), or `null` if it never has. */
    lastMovementAt: number | null;
}

export interface TrajectoryOptions {
    /** Connectivity floor — below it an idea is simply *new*, not stalled (default {@link UNEXAMINED_MIN_DEGREE}). */
    minDegree?: number;
    /** A verdict within this many days ⇒ `advancing` (default {@link TRAJECTORY_FRESH_DAYS}). */
    freshWithinDays?: number;
    /** No verdict for at least this many days ⇒ `stalled` (default {@link TRAJECTORY_STALE_DAYS}). */
    staleAfterDays?: number;
}

const DAY = 86_400_000;

/** A verdict within a week reads as active thinking. */
export const TRAJECTORY_FRESH_DAYS = 7;

/** A month with no verdict on an otherwise-substantial idea reads as stalled. */
export const TRAJECTORY_STALE_DAYS = 30;

/**
 * Classify every **important** idea (degree ≥ `minDegree`) as advancing / steady / stalled by the age of
 * its most recent verdict. A never-judged important idea is stalled with `lastMovementAt: null` — the same
 * "grew without your judgement" case {@link unexaminedIdeas} names, now placed on a spectrum. Stalled
 * ideas sort first (they are where attention is owed), then by path for a stable order. Never throws.
 */
export function trajectory(
    model: KnowledgeModel,
    history: readonly Judgement[],
    now: number,
    opts: TrajectoryOptions = {}
): IdeaTrajectory[] {
    const minDegree = opts.minDegree ?? UNEXAMINED_MIN_DEGREE;
    const freshMs = (opts.freshWithinDays ?? TRAJECTORY_FRESH_DAYS) * DAY;
    const staleMs = (opts.staleAfterDays ?? TRAJECTORY_STALE_DAYS) * DAY;

    const out: IdeaTrajectory[] = [];
    for (const idea of model.all()) {
        if (idea.maturitySignals.degree < minDegree) continue; // just new — not neglected
        const last = lastJudgementFor(history, idea.path);
        const lastMovementAt = last ? last.at : null;
        const age = lastMovementAt === null ? Infinity : now - lastMovementAt;
        const direction: TrajectoryDirection = age > staleMs ? "stalled" : age <= freshMs ? "advancing" : "steady";
        out.push({ path: idea.path, direction, lastMovementAt });
    }

    const rank = (d: TrajectoryDirection) => (d === "stalled" ? 0 : d === "steady" ? 1 : 2);
    out.sort((a, b) => rank(a.direction) - rank(b.direction) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return out;
}
