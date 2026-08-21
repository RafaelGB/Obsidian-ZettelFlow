import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { incomingRelations, outgoingRelations } from "architecture/knowledge/query/queries";

/** The relation type that expresses a contradiction (#147). */
const CONTRADICTS = "contradicts";

/**
 * The notes that **contradict** `path` (#153): the deduped union of its outgoing and incoming
 * `contradicts` semantic relations (#147) — **relation-only, no text/AI inference**. Outgoing
 * partners come first, then incoming, first-occurrence order preserved. Pure & Obsidian-free.
 */
export function findContradictions(model: KnowledgeModel, path: string): string[] {
    const partners: string[] = [
        ...outgoingRelations(model, path, CONTRADICTS).map((relation) => relation.to),
        ...incomingRelations(model, path, CONTRADICTS).map((relation) => relation.from),
    ];
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const partner of partners) {
        if (partner === path || seen.has(partner)) continue;
        seen.add(partner);
        unique.push(partner);
    }
    return unique;
}
