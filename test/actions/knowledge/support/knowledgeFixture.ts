import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import type { Idea, Source } from "architecture/knowledge/model/Idea";

/**
 * Shared fixture for the #153/#158 knowledge-action logic tests. Mirrors the `idea()` helper in
 * `test/architecture/knowledge/query/queries.test.ts`; `build()` recomputes in/out degree, so the
 * seeded degree is irrelevant — only the graph shape, state, sources, claims and `created` matter.
 */
export function idea(
    path: string,
    state: string,
    relations: { to: string; type?: string }[] = [],
    opts: { hasSources?: boolean; created?: number; claims?: { text: string; sources?: Source[] }[] } = {}
): Idea {
    const rels = relations.map((r) => ({ type: r.type ?? "link", from: path, to: r.to }));
    const claims = (opts.claims ?? []).map((c) => ({ text: c.text, sources: c.sources ?? [] }));
    return {
        path,
        title: path,
        created: opts.created ?? 0,
        modified: 0,
        state,
        relations: rels,
        claims,
        maturitySignals: {
            inDegree: 0,
            outDegree: rels.length,
            degree: rels.length,
            hasSources: opts.hasSources ?? false,
        },
    };
}

export function buildModel(ideas: Idea[]): KnowledgeModel {
    const model = new KnowledgeModel();
    model.build(ideas);
    return model;
}
