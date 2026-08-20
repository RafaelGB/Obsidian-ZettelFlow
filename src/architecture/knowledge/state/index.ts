import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";

/**
 * **Knowledge State** (#266, epic #262 Phase 4) — the single surface the Experience layer imports.
 *
 * Every entry point here is a **pure projection of the `KnowledgeModel`** (metrics are consequences,
 * not inventions): `(model, params?) => Result`, offline and unit-tested with no live vault. Views
 * (`architecture/components/core/*`) consume this facade instead of deep per-analysis imports, so
 * there is one home for "what the model says" and no view re-derives a metric a projection owns.
 *
 * §XI: this module stays obsidian-free (guarded by `pure-is-obsidian-free.test.ts` over `state/`).
 */

/** The shape every Knowledge State projection follows: a pure function of the model (+ optional params). */
export type StateProjection<Params extends unknown[] = [], Result = unknown> = (
    model: KnowledgeModel,
    ...params: Params
) => Result;

export * from "architecture/knowledge/home/home";
export * from "architecture/knowledge/dashboard/knowledgeDashboard";
export * from "architecture/knowledge/balance/knowledgeBalance";
export * from "architecture/knowledge/debt/knowledgeDebt";
export * from "architecture/knowledge/review/weeklyReview";
export * from "architecture/knowledge/discovery/discoveries";
export * from "architecture/knowledge/questions/openQuestions";
export * from "architecture/knowledge/questions/proposeAnswers";
export * from "architecture/knowledge/map/knowledgeMap";
export * from "architecture/knowledge/traverse/conceptNeighbors";
export * from "architecture/knowledge/synthesis/evidenceMap";
export * from "architecture/knowledge/journal/heatmap";
export * from "architecture/knowledge/projects/deriveOutline";
export type { Snapshot } from "architecture/knowledge/timeline/recordSnapshot";
