import type { Idea, IdeaState, Relation } from "../model/Idea";
import type { KnowledgeModel } from "../model/KnowledgeModel";

/**
 * Read-only query surface over the {@link KnowledgeModel}. Pure functions, no mutation, no
 * re-derivation — they read the incrementally-maintained indexes (AC-3, AC-7, AC-8).
 *
 * Terminology note (spec FR-5): `orphans` = notes with **no incoming** edges, `leaves` = notes
 * with **no outgoing** edges. The slip-box health view (`classifyHealth`) currently uses the
 * inverted convention; the unambiguous primitives {@link notesWithNoIncoming} /
 * {@link notesWithNoOutgoing} are exposed so the FR-10 migration can map either naming explicitly.
 */

export function get(model: KnowledgeModel, path: string): Idea | undefined {
    return model.get(path);
}

export function byState(model: KnowledgeModel, state: IdeaState): Idea[] {
    return model.all().filter((idea) => idea.state === state);
}

/** Every idea grouped by its state — a total partition (each idea in exactly one bucket). */
export function statePartition(model: KnowledgeModel): Map<IdeaState, Idea[]> {
    const partition = new Map<IdeaState, Idea[]>();
    for (const idea of model.all()) {
        const bucket = partition.get(idea.state);
        if (bucket) bucket.push(idea);
        else partition.set(idea.state, [idea]);
    }
    return partition;
}

export function edgesByType(model: KnowledgeModel, type: string): Relation[] {
    return model.edgesOfType(type);
}

export function outgoingRelations(model: KnowledgeModel, path: string, type?: string): Relation[] {
    const idea = model.get(path);
    if (!idea) return [];
    return idea.relations.filter((relation) => type === undefined || relation.type === type);
}

export function incomingRelations(model: KnowledgeModel, path: string, type?: string): Relation[] {
    const relations: Relation[] = [];
    for (const source of model.inNeighbors(path)) {
        const idea = model.get(source);
        if (!idea) continue;
        for (const relation of idea.relations) {
            if (relation.to === path && (type === undefined || relation.type === type)) {
                relations.push(relation);
            }
        }
    }
    return relations;
}

/** Unambiguous primitive: notes nothing points to. */
export function notesWithNoIncoming(model: KnowledgeModel): Idea[] {
    return model.all().filter((idea) => model.inNeighbors(idea.path).length === 0);
}

/** Unambiguous primitive: notes that point to nothing. */
export function notesWithNoOutgoing(model: KnowledgeModel): Idea[] {
    return model.all().filter((idea) => model.outNeighbors(idea.path).length === 0);
}

/** Spec FR-5 alias: an orphan has no incoming edges. */
export function orphans(model: KnowledgeModel): Idea[] {
    return notesWithNoIncoming(model);
}

/** Spec FR-5 alias: a leaf has no outgoing edges. */
export function leaves(model: KnowledgeModel): Idea[] {
    return notesWithNoOutgoing(model);
}

export function hubs(model: KnowledgeModel, threshold = 5): Idea[] {
    return model.all().filter((idea) => idea.maturitySignals.degree >= threshold);
}

export function unsourced(model: KnowledgeModel): Idea[] {
    return model.all().filter((idea) => !idea.maturitySignals.hasSources);
}

export type MaturityTier = "isolated" | "sparse" | "connected";

function tierOf(idea: Idea): MaturityTier {
    const degree = idea.maturitySignals.degree;
    if (degree === 0) return "isolated";
    if (degree <= 3) return "sparse";
    return "connected";
}

/** Group ideas by a coarse connectivity tier derived from raw signals (the real score is #158). */
export function byMaturity(model: KnowledgeModel): Map<MaturityTier, Idea[]> {
    const grouped = new Map<MaturityTier, Idea[]>();
    for (const idea of model.all()) {
        const tier = tierOf(idea);
        const bucket = grouped.get(tier);
        if (bucket) bucket.push(idea);
        else grouped.set(tier, [idea]);
    }
    return grouped;
}
