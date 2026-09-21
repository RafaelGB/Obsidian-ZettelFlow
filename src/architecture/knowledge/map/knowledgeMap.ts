import type { KnowledgeModel } from "../model/KnowledgeModel";
import { memoise } from "../model/memo";

/** A connected region of the idea graph: its most connected note, and the rest of it (#513). */
export interface Cluster {
    /** The region's most connected note — what a reader would call the region. Ties broken by path. */
    hub: string;
    /** That note's degree. */
    degree: number;
    /** The rest of the region, sorted by path. */
    members: string[];
}

export interface KnowledgeMap {
    clusters: Cluster[];
    /** Notes with no link to anything else in the model — alone, which is a state, not a leftover. */
    unclustered: string[];
}

const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Pure "living knowledge map" builder (#164, rewritten by #513). A **region is a connected
 * component** of the undirected link graph, so every note belongs to exactly one and coverage is a
 * property of the partition rather than an outcome of a threshold.
 *
 * It used to be a heuristic: notes of degree ≥ 5 were hubs, and every other note joined its
 * strongest adjacent hub. Measured on a 421-note vault that gave **31 regions covering 27 %** of
 * the notes, leaving 309 in `unclustered` — and lowering the threshold to 3 gave **250 regions**.
 * The same vault has 99 components, the largest holding 248 notes; that shape needs no parameter,
 * so the parameter went.
 *
 * Only **in-model** neighbours are walked. `KnowledgeModel.attach()` records `relation.to` whether
 * or not the target is an idea, so a note whose only link leaves the scope has a degree but no
 * neighbour here — it is alone in this graph, which is the graph the map describes.
 *
 * Regions ordered by size desc then hub path; members and `unclustered` sorted by path.
 * Deterministic, read-only, never throws; empty model ⇒ empty map. Obsidian-free.
 */
export const buildKnowledgeMap = memoise("knowledgeMap", (model: KnowledgeModel): KnowledgeMap => {
    const ideas = model.all().sort((a, b) => byPath(a.path, b.path));
    const degreeOf = new Map(ideas.map((idea) => [idea.path, idea.maturitySignals.degree]));
    const seen = new Set<string>();
    const clusters: Cluster[] = [];
    const unclustered: string[] = [];

    for (const start of ideas) {
        if (seen.has(start.path)) continue;
        seen.add(start.path);
        const region = [start.path];
        for (let read = 0; read < region.length; read++) {
            const path = region[read];
            for (const set of [model.outNeighborSet(path), model.inNeighborSet(path)]) {
                for (const next of set) {
                    if (seen.has(next) || !degreeOf.has(next)) continue;
                    seen.add(next);
                    region.push(next);
                }
            }
        }
        if (region.length === 1) {
            unclustered.push(start.path);
            continue;
        }
        region.sort(byPath);
        const hub = region.reduce((best, path) =>
            (degreeOf.get(path) ?? 0) > (degreeOf.get(best) ?? 0) ? path : best
        );
        clusters.push({ hub, degree: degreeOf.get(hub) ?? 0, members: region.filter((path) => path !== hub) });
    }

    clusters.sort((a, b) => b.members.length - a.members.length || byPath(a.hub, b.hub));
    unclustered.sort(byPath);
    return { clusters, unclustered };
});
