import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";

/**
 * The `calculate-maturity` composite (#153). A **deterministic 0–100** score of how developed a note
 * is, from four graph-local signals — lifecycle **state** (#146), **connectivity** (in+out degree,
 * #145), **sources** (#148), and **age/seasoning** — with documented weights. `now` is **injected**
 * so the score is reproducible and testable (no `Date.now()` inside). This action is the *feed* for
 * the Knowledge State maturity score (#158), which owns aggregation/persistence. Pure & Obsidian-free.
 */

export interface MaturityWeights {
    state: number;
    connectivity: number;
    sources: number;
    recency: number;
}

/** Weights sum to 100 so the raw composite is already on a 0–100 scale. */
export const MATURITY_WEIGHTS: MaturityWeights = {
    state: 40,
    connectivity: 30,
    sources: 15,
    recency: 15,
};

/** How mature each lifecycle state is (0..1). Archived is deliberately mid, not top (#146 ladder). */
export const STATE_FACTOR: Record<string, number> = {
    fleeting: 0.0,
    literature: 0.3,
    developing: 0.5,
    permanent: 0.8,
    evergreen: 1.0,
    archived: 0.6,
};

/** Degree at which connectivity is considered "full". */
const CONNECTIVITY_CAP = 10;
/** Age (days) at which the seasoning factor is considered "full". */
const RECENCY_CAP_DAYS = 180;
const DAY_MS = 86_400_000;

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

/**
 * The 0–100 maturity score for `path` at time `now`, or `null` when the note is absent from the
 * model (unindexed / index not ready — a safe no-op upstream).
 */
export function computeMaturity(
    model: KnowledgeModel,
    path: string,
    now: number,
    weights: MaturityWeights = MATURITY_WEIGHTS
): number | null {
    const idea = model.get(path);
    if (!idea) return null;

    const stateFactor = STATE_FACTOR[idea.state] ?? 0;
    const connectivity = clamp01(idea.maturitySignals.degree / CONNECTIVITY_CAP);
    const sources = idea.maturitySignals.hasSources ? 1 : 0;
    const ageDays = Math.max(0, (now - idea.created) / DAY_MS);
    const recency = clamp01(ageDays / RECENCY_CAP_DAYS);

    const raw =
        weights.state * stateFactor +
        weights.connectivity * connectivity +
        weights.sources * sources +
        weights.recency * recency;

    return Math.max(0, Math.min(100, Math.round(raw)));
}
