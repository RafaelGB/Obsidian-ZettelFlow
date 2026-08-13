import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { incomingRelations, outgoingRelations } from "architecture/knowledge/query/queries";

/** The relation types for an open question and its answer (#147). */
const QUESTION = "question";
const SUPPORTS = "supports";

/**
 * The **unanswered questions** `path` raises (#153): its outgoing `question` relations (#147) whose
 * destination has **no incoming `supports`** edge (nothing answers it yet). Deduped, first-occurrence
 * order. Relation-only, deterministic. Pure & Obsidian-free.
 */
export function findUnansweredQuestions(model: KnowledgeModel, path: string): string[] {
    const seen = new Set<string>();
    const unanswered: string[] = [];
    for (const relation of outgoingRelations(model, path, QUESTION)) {
        const question = relation.to;
        if (seen.has(question)) continue;
        seen.add(question);
        if (incomingRelations(model, question, SUPPORTS).length === 0) unanswered.push(question);
    }
    return unanswered;
}
