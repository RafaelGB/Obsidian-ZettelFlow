import type { KnowledgeModel } from "../model/KnowledgeModel";
import type { Idea } from "../model/Idea";

/** What a note is *made of* — a mutually-exclusive composition role (#161). */
export type CompositionBucket = "reference" | "question" | "example" | "conclusion" | "concept";

/** A balance-improving nudge when an expected bucket is under-represented. */
export type BalanceSuggestion = "add-sources" | "add-examples" | "ask-questions";

export interface BucketMetric {
    key: CompositionBucket;
    count: number;
    /** count / total as a rounded whole percent (0 when the vault is empty). */
    percent: number;
}

export interface KnowledgeBalance {
    total: number;
    buckets: BucketMetric[];
    suggestions: BalanceSuggestion[];
}

/** Fixed display/return order. */
export const COMPOSITION_BUCKETS: readonly CompositionBucket[] = [
    "reference",
    "question",
    "example",
    "conclusion",
    "concept",
];

/** Under a fresh vault the composition is meaningless — don't nag. */
export const MIN_NOTES_FOR_SUGGESTIONS = 5;
const REFERENCE_FLOOR = 15;
const EXAMPLE_FLOOR = 10;
const QUESTION_FLOOR = 5;

/**
 * Classify a note into exactly one composition bucket, **evidence-first** (#161): a note carrying a
 * source is a `reference` regardless of what else it does; otherwise its dominant outgoing semantic
 * relation decides (`question` → `example` → `supports`/`implements` = `conclusion`); else `concept`.
 */
export function classifyBucket(idea: Idea): CompositionBucket {
    if (idea.maturitySignals.hasSources) return "reference";
    const has = (type: string): boolean => idea.relations.some((relation) => relation.type === type);
    if (has("question")) return "question";
    if (has("example")) return "example";
    if (has("supports") || has("implements")) return "conclusion";
    return "concept";
}

/**
 * Pure composition aggregate (#161). Partitions every note into one {@link CompositionBucket} and
 * returns per-bucket `{ count, percent }` (percent rounded, summing to ~100) + the total, plus
 * balance suggestions when an expected bucket is under its floor (only for vaults ≥
 * {@link MIN_NOTES_FOR_SUGGESTIONS}, using the exact un-rounded ratio). Reads only the model;
 * deterministic, read-only, never throws; empty model ⇒ total 0 / all 0% / no suggestions.
 * Obsidian-free.
 */
export function computeKnowledgeBalance(model: KnowledgeModel): KnowledgeBalance {
    const all = model.all();
    const total = all.length;
    const counts: Record<CompositionBucket, number> = {
        reference: 0,
        question: 0,
        example: 0,
        conclusion: 0,
        concept: 0,
    };
    for (const idea of all) counts[classifyBucket(idea)]++;

    const buckets: BucketMetric[] = COMPOSITION_BUCKETS.map((key) => ({
        key,
        count: counts[key],
        percent: total > 0 ? Math.round((100 * counts[key]) / total) : 0,
    }));

    const suggestions: BalanceSuggestion[] = [];
    if (total >= MIN_NOTES_FOR_SUGGESTIONS) {
        const pct = (key: CompositionBucket): number => (100 * counts[key]) / total;
        if (pct("reference") < REFERENCE_FLOOR) suggestions.push("add-sources");
        if (pct("example") < EXAMPLE_FLOOR) suggestions.push("add-examples");
        if (pct("question") < QUESTION_FLOOR) suggestions.push("ask-questions");
    }

    return { total, buckets, suggestions };
}
