import type { KnowledgeModel } from "../model/KnowledgeModel";
import { memoise } from "../model/memo";
import { communitiesOf } from "../map/communities";

/**
 * The graph-shaped facts a question can ask about (#696, epic #692): which region a note lives in,
 * whether it links across regions, whether it is alone, whether it is in a contradiction.
 *
 * They used to be lenses only the 3D graph could apply — seven chips behind a gear — so the answer
 * to "what joins my regions?" could be looked at but never asked, saved, narrowed or pinned to Home.
 * As facts the query engine reads, every one of them is an ordinary term.
 *
 * Memoised per model revision: the communities are the expensive part, and Louvain already is.
 */
export interface GraphFacts {
    /** Note path → its region's hub path. A note that is alone has none. */
    regionOf: Map<string, string>;
    /** Notes with a link (either way) to a note in another region — where regions meet (#525). */
    bridge: Set<string>;
    /** Notes in a `contradicts` relation, either side of it (#280 S4). */
    contradiction: Set<string>;
}

export const graphFacts = memoise("graphFacts", (model: KnowledgeModel): GraphFacts => {
    const regionOf = new Map<string, string>();
    for (const community of communitiesOf(model)) {
        regionOf.set(community.hub, community.hub);
        for (const member of community.members) regionOf.set(member, community.hub);
    }
    const bridge = new Set<string>();
    const contradiction = new Set<string>();
    for (const idea of model.all()) {
        const own = regionOf.get(idea.path);
        for (const relation of idea.relations) {
            const theirs = regionOf.get(relation.to);
            if (theirs === undefined) continue;
            if (own !== undefined && theirs !== own) {
                bridge.add(idea.path);
                bridge.add(relation.to);
            }
            if (relation.type === "contradicts") {
                contradiction.add(idea.path);
                contradiction.add(relation.to);
            }
        }
    }
    return { regionOf, bridge, contradiction };
});

/** The basename of a path, without `.md`: what a region is called until you rename it (#697). */
export function regionBasename(hub: string): string {
    return (hub.split("/").pop() ?? hub).replace(/\.md$/i, "");
}
