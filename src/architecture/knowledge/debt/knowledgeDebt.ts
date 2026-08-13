import type { KnowledgeModel } from "../model/KnowledgeModel";
import type { Idea } from "../model/Idea";
import { notesWithNoIncoming, notesWithNoOutgoing, unsourced } from "../query/queries";

/** The four shipped debt categories (#159). Self-describing keys avoid the older view's inverted "orphan"/"dead-end" wording. */
export type DebtCategoryKey = "unreferenced" | "dangling" | "unsourced" | "open-question";

/** The fix a debt category points at — a locale-free token the UI maps to an action/label. */
export type RemediationToken = "connect" | "add-source" | "answer-question";

export interface DebtCategory {
    key: DebtCategoryKey;
    count: number;
    /** Affected note paths, sorted ascending for stable drill-down. */
    paths: string[];
    remediation: RemediationToken;
}

export interface KnowledgeDebt {
    /** 0–100; 0 = clean; higher = more debt. */
    score: number;
    /** Total notes in the model (the denominator). */
    total: number;
    categories: DebtCategory[];
}

/** Category weights (sum 1.0). Sourcing rigor weighs most; dangling least. */
export const DEBT_WEIGHTS: Record<DebtCategoryKey, number> = {
    unreferenced: 0.25,
    dangling: 0.20,
    unsourced: 0.30,
    "open-question": 0.25,
};

/** Bucket a 0–100 debt score into a severity band for the (lint-safe) bar (#159, D-e). */
export function severityBucket(score: number): "low" | "medium" | "high" {
    return score < 34 ? "low" : score < 67 ? "medium" : "high";
}

/** True when `path` has any incoming `supports` edge (i.e. a question pointed at it is answered). */
function hasIncomingSupports(model: KnowledgeModel, path: string): boolean {
    for (const source of model.inNeighbors(path)) {
        const idea = model.get(source);
        if (idea?.relations.some((relation) => relation.type === "supports" && relation.to === path)) {
            return true;
        }
    }
    return false;
}

/** Notes raising ≥1 open question: an outgoing `question` edge to an indexed note with no incoming `supports`. */
function notesWithOpenQuestions(model: KnowledgeModel): Idea[] {
    return model.all().filter((idea) =>
        idea.relations.some(
            (relation) =>
                relation.type === "question" &&
                model.get(relation.to) !== undefined &&
                !hasIncomingSupports(model, relation.to)
        )
    );
}

const sortedPaths = (ideas: Idea[]): string[] => ideas.map((idea) => idea.path).sort();

/**
 * Pure Knowledge Debt aggregate (#159). Composes the existing `queries.ts` predicates into four
 * debt categories, each with its affected note paths and a remediation token, plus a single 0–100
 * Debt Score = `round(100 · Σ weightᵢ · countᵢ/max(1,total))`, clamped, `0` when clean/empty. Reads
 * only the {@link KnowledgeModel}; deterministic, read-only, never throws. Obsidian-free.
 */
export function computeKnowledgeDebt(model: KnowledgeModel): KnowledgeDebt {
    const total = model.size();
    const categories: DebtCategory[] = [
        { key: "unreferenced", paths: sortedPaths(notesWithNoIncoming(model)), remediation: "connect", count: 0 },
        { key: "dangling", paths: sortedPaths(notesWithNoOutgoing(model)), remediation: "connect", count: 0 },
        { key: "unsourced", paths: sortedPaths(unsourced(model)), remediation: "add-source", count: 0 },
        { key: "open-question", paths: sortedPaths(notesWithOpenQuestions(model)), remediation: "answer-question", count: 0 },
    ];
    for (const category of categories) category.count = category.paths.length;

    const denominator = Math.max(1, total);
    let weighted = 0;
    for (const category of categories) {
        weighted += DEBT_WEIGHTS[category.key] * (category.count / denominator);
    }
    const score = Math.min(100, Math.max(0, Math.round(100 * weighted)));

    return { score, total, categories };
}
