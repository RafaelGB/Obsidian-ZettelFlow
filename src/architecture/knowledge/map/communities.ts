import type { KnowledgeModel } from "../model/KnowledgeModel";
import { buildKnowledgeMap } from "./knowledgeMap";
import { memoise } from "../model/memo";

/** A neighbourhood inside a region: notes that link to each other far more than to the rest (#524). */
export interface Community {
    /** The community's most connected note — and its name. Ties break by path. */
    hub: string;
    /** The region it nests inside, named by that region's hub. A community never straddles two. */
    region: string;
    /** The rest of the community, sorted by path. */
    members: string[];
}

const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Louvain works on integer ids; one level of the graph, with weights, and who each node contains. */
interface Level {
    /** Undirected adjacency, `node → neighbour → weight`. Never holds a self-loop. */
    adjacency: Map<number, number>[];
    /** Weight of the edges wholly inside this super-node, counted once. */
    selfLoop: number[];
    /** The original vault paths each super-node stands for. */
    members: string[][];
}

function degreeOf(level: Level, node: number): number {
    let total = 2 * level.selfLoop[node];
    for (const weight of level.adjacency[node].values()) total += weight;
    return total;
}

/**
 * One Louvain pass: move each node to the neighbouring community that gains the most modularity,
 * repeating until a sweep moves nobody. Returns a community id per node, or `null` if nothing moved.
 *
 * Deterministic by construction — nodes are walked in index order (which is path order, set by the
 * caller) and a tie resolves to the lowest community id.
 */
function localMoving(level: Level): number[] | null {
    const size = level.adjacency.length;
    const degrees = Array.from({ length: size }, (_, node) => degreeOf(level, node));
    const m2 = degrees.reduce((total, degree) => total + degree, 0);
    if (m2 === 0) return null;

    const community = Array.from({ length: size }, (_, node) => node);
    const communityDegree = [...degrees];
    let movedEver = false;

    for (let sweep = 0; sweep < 30; sweep++) {
        let moved = 0;
        for (let node = 0; node < size; node++) {
            const own = community[node];
            const degree = degrees[node];
            const sharedWith = new Map<number, number>();
            for (const [neighbour, weight] of level.adjacency[node]) {
                const target = community[neighbour];
                sharedWith.set(target, (sharedWith.get(target) ?? 0) + weight);
            }
            communityDegree[own] -= degree;

            let best = own;
            let bestGain = (sharedWith.get(own) ?? 0) - (communityDegree[own] * degree) / m2;
            for (const [candidate, shared] of sharedWith) {
                const gain = shared - (communityDegree[candidate] * degree) / m2;
                // A tie goes to the lower id, so the answer cannot depend on Map iteration order.
                if (gain > bestGain + 1e-12 || (Math.abs(gain - bestGain) <= 1e-12 && candidate < best)) {
                    bestGain = gain;
                    best = candidate;
                }
            }

            communityDegree[best] += degree;
            if (best !== own) {
                community[node] = best;
                moved++;
                movedEver = true;
            }
        }
        if (moved === 0) break;
    }
    return movedEver ? community : null;
}

/** Collapse each community into one super-node, carrying the edge weights between and within. */
function aggregate(level: Level, community: number[]): Level {
    const relabel = new Map<number, number>();
    for (const id of community) if (!relabel.has(id)) relabel.set(id, relabel.size);
    const size = relabel.size;

    const next: Level = {
        adjacency: Array.from({ length: size }, () => new Map<number, number>()),
        selfLoop: Array.from({ length: size }, () => 0),
        members: Array.from({ length: size }, () => [] as string[]),
    };

    for (let node = 0; node < level.adjacency.length; node++) {
        const a = relabel.get(community[node]) as number;
        next.members[a].push(...level.members[node]);
        next.selfLoop[a] += level.selfLoop[node];
        for (const [neighbour, weight] of level.adjacency[node]) {
            if (neighbour < node) continue; // the adjacency is symmetric; take each edge once
            const b = relabel.get(community[neighbour]) as number;
            if (a === b) {
                next.selfLoop[a] += weight;
            } else {
                next.adjacency[a].set(b, (next.adjacency[a].get(b) ?? 0) + weight);
                next.adjacency[b].set(a, (next.adjacency[b].get(a) ?? 0) + weight);
            }
        }
    }
    return next;
}

/** Run Louvain over one region's notes and hand back the groups of paths it settles on. */
function louvain(paths: string[], model: KnowledgeModel): string[][] {
    const index = new Map(paths.map((path, at) => [path, at]));
    let level: Level = {
        adjacency: paths.map((path) => {
            const neighbours = new Map<number, number>();
            for (const set of [model.outNeighborSet(path), model.inNeighborSet(path)]) {
                for (const other of set) {
                    const at = index.get(other);
                    // A link's target is in the adjacency whether or not it is an idea, and a note
                    // may link to itself; neither is an edge of this graph.
                    if (at === undefined || other === path) continue;
                    neighbours.set(at, 1); // unweighted: a pair of notes is linked or it is not
                }
            }
            return neighbours;
        }),
        selfLoop: paths.map(() => 0),
        members: paths.map((path) => [path]),
    };

    for (let pass = 0; pass < 12; pass++) {
        const community = localMoving(level);
        if (!community) break;
        const next = aggregate(level, community);
        if (next.adjacency.length === level.adjacency.length) break; // nothing collapsed
        level = next;
    }
    return level.members;
}

/**
 * The **neighbourhoods** of the idea graph (#524, epic #522) — Louvain communities, found inside
 * each region rather than across the whole graph.
 *
 * A region is a connected component (#513): it answers *what is cut off from what*, and on a real
 * 421-note vault one region held 59 % of the notes, where it answers nothing. Louvain splits that
 * mass into **17 communities** of 9 to 36 notes, the largest only 13 % of it — and *that* is where
 * a bridge (an edge between two communities) and a frontier note (one touching several) exist at
 * all.
 *
 * Epic #512 concluded there was no such structure. It had tried exactly one algorithm, label
 * propagation, which collapsed 244 of 248 notes into a single community — a documented failure
 * mode of label propagation on sparse hub-heavy graphs, and not a fact about the graph.
 *
 * Running **per region** is the one design choice worth naming. Modularity would never merge
 * across components anyway, so it is not about the partition being right: it makes *a community
 * never straddles a region* true by construction, hands each community its region without a second
 * lookup, and runs on several small graphs instead of one holding a blob and a hundred singletons.
 *
 * Deterministic (path order, ties to the lowest id), read-only, never throws; a note with no
 * in-model neighbour belongs to no community, because it is already `KnowledgeMap.unclustered`.
 * Communities ordered by size desc then hub path; members sorted by path. Obsidian-free.
 */
export const communitiesOf = memoise("communitiesOf", (model: KnowledgeModel): Community[] => {
    const degreeOfPath = new Map(model.all().map((idea) => [idea.path, idea.maturitySignals.degree]));
    const communities: Community[] = [];

    for (const cluster of buildKnowledgeMap(model).clusters) {
        const paths = [cluster.hub, ...cluster.members].sort(byPath);
        for (const group of louvain(paths, model)) {
            if (group.length === 0) continue;
            const sorted = [...group].sort(byPath);
            const hub = sorted.reduce((best, path) =>
                (degreeOfPath.get(path) ?? 0) > (degreeOfPath.get(best) ?? 0) ? path : best
            );
            communities.push({ hub, region: cluster.hub, members: sorted.filter((path) => path !== hub) });
        }
    }

    communities.sort((a, b) => b.members.length - a.members.length || byPath(a.hub, b.hub));
    return communities;
});
