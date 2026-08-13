import type { KnowledgeModel } from "../model/KnowledgeModel";
import { incomingRelations } from "../query/queries";
import { rankRelatedScored } from "actions/relations/relationRankingLogic";

/** A note proposed as an answer to an open question, with its relatedness score (#167). */
export interface AnswerCandidate {
    path: string;
    score: number;
}

export interface ProposeAnswersOptions {
    /** How many candidates to propose (default 5, matching the relation-suggestion default). */
    limit?: number;
}

const DEFAULT_LIMIT = 5;

/**
 * Pure answer-detection heuristic (#167, FR-3/FR-4/FR-5). For an **open** question, proposes the
 * notes most likely to answer it — the top-N by the #154 relatedness score (`rankRelatedScored`:
 * co-citation weighted above coupling), which already excludes the question's askers and any directly
 * connected note. Each candidate is the `candidate --supports--> question` link the view suggests.
 *
 * Returns `[]` when the question is unknown/unindexed, already answered (it has an incoming
 * `supports`), or shares no graph context. Reads only the {@link KnowledgeModel}; deterministic,
 * read-only, never throws. Obsidian-free — reuses the single relatedness metric, no new score.
 */
export function proposeAnswers(
    model: KnowledgeModel,
    questionPath: string,
    opts: ProposeAnswersOptions = {}
): AnswerCandidate[] {
    if (!model.get(questionPath)) return [];
    if (incomingRelations(model, questionPath, "supports").length > 0) return [];

    const limit = opts.limit ?? DEFAULT_LIMIT;
    // ScoredRelated is structurally an AnswerCandidate; rankRelatedScored returns fresh objects.
    return rankRelatedScored(model, questionPath, { limit });
}
