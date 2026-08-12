import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import type { Idea, Source } from "architecture/knowledge/model/Idea";

/**
 * Shared fixture for the #155 research-action logic tests. `build()` recomputes degree, so seeded
 * signals are irrelevant — only claims, sources and relation shape matter.
 */
export function ideaWithClaims(
    path: string,
    claims: { text: string; sources?: Source[] }[],
    relations: { to: string; type?: string }[] = []
): Idea {
    const rels = relations.map((r) => ({ type: r.type ?? "link", from: path, to: r.to }));
    const cls = claims.map((c) => ({ text: c.text, sources: c.sources ?? [] }));
    return {
        path,
        title: path,
        created: 0,
        modified: 0,
        state: "permanent",
        relations: rels,
        claims: cls,
        maturitySignals: {
            inDegree: 0,
            outDegree: rels.length,
            degree: rels.length,
            hasSources: cls.some((c) => c.sources.length > 0),
        },
    };
}

export function buildModel(ideas: Idea[]): KnowledgeModel {
    const model = new KnowledgeModel();
    model.build(ideas);
    return model;
}
