import { t } from "architecture/lang";
import { type KnowledgeModel } from "architecture/knowledge";
import {
    deriveRecommendations,
    KnowledgeRecommendation,
    RecommendationReason,
    Judgement,
} from "architecture/knowledge/state";

type LocaleKey = Parameters<typeof t>[0];

/** How many recommendations the Home "What to do next" section shows (top by priority). */
export const HOME_RECOMMENDATIONS_LIMIT = 5;

/** The sentence-case label shown for each recommendation reason (#273). Exhaustive by the Record type. */
export const REASON_LABEL_KEYS: Record<RecommendationReason, LocaleKey> = {
    "resolve-contradiction": "home_recommendation_reason_resolve-contradiction",
    "add-source": "home_recommendation_reason_add-source",
    "connect": "home_recommendation_reason_connect",
    "answer-question": "home_recommendation_reason_answer-question",
    "advance-state": "home_recommendation_reason_advance-state",
    "re-engage": "home_recommendation_reason_re-engage",
    "develop-hub": "home_recommendation_reason_develop-hub",
    "process-ideas": "home_recommendation_reason_process-ideas",
    "review-note": "home_recommendation_reason_review-note",
    "add-examples": "home_recommendation_reason_add-examples",
    "ask-questions": "home_recommendation_reason_ask-questions",
    "reduce-debt": "home_recommendation_reason_reduce-debt",
    "all-clear": "home_recommendation_reason_all-clear",
};

/** The top-N recommendations by priority — a pure slice of the primitive (no re-sort/filter, #273). */
export function topRecommendations(
    model: KnowledgeModel,
    limit = HOME_RECOMMENDATIONS_LIMIT,
    /** The judgement record (#339), so "grew without your judgement" can be one of the rows. */
    history?: readonly Judgement[]
): KnowledgeRecommendation[] {
    return deriveRecommendations(model, history).slice(0, limit);
}

/** True when there's nothing actionable — no rows, or only the `all-clear` reason. */
export function isAllCaughtUp(rows: KnowledgeRecommendation[]): boolean {
    return rows.every((row) => row.reason === "all-clear");
}
