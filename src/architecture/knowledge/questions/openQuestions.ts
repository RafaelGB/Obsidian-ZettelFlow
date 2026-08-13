import type { KnowledgeModel } from "../model/KnowledgeModel";
import { edgesByType, incomingRelations } from "../query/queries";

/** An unanswered question raised somewhere in the vault, with the notes that asked it. */
export interface OpenQuestion {
    path: string;
    askedBy: string[];
}

function compareStrings(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Pure vault-wide open-questions query (#167, FR-1/FR-2). Generalises #153's per-note
 * `findUnansweredQuestions`: collects every `question` edge (#147), groups the askers (`from`) by the
 * question note (`to`), and keeps only questions with **no incoming `supports`** — i.e. nothing
 * answers them yet. Sorted by question path asc, `askedBy` deduped + sorted asc.
 *
 * Reads only the {@link KnowledgeModel}; deterministic, read-only, never throws. Obsidian-free.
 */
export function openQuestions(model: KnowledgeModel): OpenQuestion[] {
    const askersByQuestion = new Map<string, Set<string>>();
    for (const edge of edgesByType(model, "question")) {
        const askers = askersByQuestion.get(edge.to) ?? new Set<string>();
        askers.add(edge.from);
        askersByQuestion.set(edge.to, askers);
    }

    const result: OpenQuestion[] = [];
    for (const [path, askers] of askersByQuestion) {
        if (incomingRelations(model, path, "supports").length > 0) continue;
        result.push({ path, askedBy: [...askers].sort(compareStrings) });
    }
    return result.sort((a, b) => compareStrings(a.path, b.path));
}
