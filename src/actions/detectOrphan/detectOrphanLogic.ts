import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";

/**
 * Whether a note is an **orphan** (#153): no incoming *and* no outgoing edges — the model's
 * `isolated` tier (`degree === 0`). Single source of truth is the #145 `KnowledgeModel` (not the
 * #121 slip-box-health classifier, whose orphan/dead-end naming is inverted). Returns `null` when the
 * note is absent from the model (unindexed / index not ready) so the action can safely no-op.
 * Pure & Obsidian-free.
 */
export function computeIsOrphan(model: KnowledgeModel, path: string): boolean | null {
    const idea = model.get(path);
    if (!idea) return null;
    return idea.maturitySignals.degree === 0;
}
