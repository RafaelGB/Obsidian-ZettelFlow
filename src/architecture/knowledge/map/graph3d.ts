import type { KnowledgeModel } from "../model/KnowledgeModel";

/** A node in the 3D graph — identity is the vault `path`; `name` labels it, `val` sizes it. */
export interface Graph3DNode {
    id: string;
    name: string;
    val: number;
}

/** A directed link between two existing nodes (source/target are vault paths). */
export interface Graph3DLink {
    source: string;
    target: string;
}

export interface Graph3DData {
    nodes: Graph3DNode[];
    links: Graph3DLink[];
}

function basename(path: string): string {
    const file = path.split("/").pop() ?? path;
    return file.replace(/\.md$/i, "");
}

const byStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Pure projection of the {@link KnowledgeModel} into a `{ nodes, links }` shape for the 3D graph view
 * (#280 S1). Nodes are ideas (id = path, name = basename, `val` = degree for sizing); links are the
 * model's out-edges, **filtered to edges whose target is also a node** so the force layout never gets a
 * dangling reference. Deterministic (sorted) and Obsidian-free; empty model ⇒ empty graph.
 */
export function build3DGraph(model: KnowledgeModel): Graph3DData {
    const ideas = model.all();
    const ids = new Set(ideas.map((idea) => idea.path));

    const nodes: Graph3DNode[] = ideas
        .map((idea) => ({
            id: idea.path,
            name: basename(idea.path),
            val: Math.max(1, idea.maturitySignals.degree),
        }))
        .sort((a, b) => byStr(a.id, b.id));

    const links: Graph3DLink[] = [];
    for (const idea of ideas) {
        for (const target of model.outNeighbors(idea.path)) {
            if (ids.has(target)) links.push({ source: idea.path, target });
        }
    }
    links.sort((a, b) => byStr(a.source, b.source) || byStr(a.target, b.target));

    return { nodes, links };
}
