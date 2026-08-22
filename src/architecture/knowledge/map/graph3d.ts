import type { KnowledgeModel } from "../model/KnowledgeModel";
import { buildKnowledgeMap } from "./knowledgeMap";

/** A node in the 3D graph — identity is the vault `path`; `name` labels it, `val` sizes it. */
export interface Graph3DNode {
    id: string;
    name: string;
    /** Relative size (node degree, min 1). */
    val: number;
    /** Cluster index for coloring (its hub's cluster), or -1 when the note orbits no hub. */
    group: number;
    /** The idea's workflow state (for optional coloring / filtering). */
    state: string;
}

/** A directed, typed link between two existing nodes (source/target are vault paths). */
export interface Graph3DLink {
    source: string;
    target: string;
    /** Relation type — `"link"` for a plain wikilink, else a #147 semantic relation (supports, …). */
    type: string;
}

export interface Graph3DData {
    nodes: Graph3DNode[];
    links: Graph3DLink[];
}

/**
 * Relation type → Obsidian CSS colour variable. The single source of truth shared by the WebGL links
 * (the renderer reads the computed value) and the legend swatches (`graph3d.scss` uses the same vars),
 * so colours never drift. An unlisted type falls back to `--text-faint`.
 */
export const RELATION_COLOR_VARS: Record<string, string> = {
    link: "--text-faint",
    supports: "--color-green",
    contradicts: "--color-red",
    expands: "--color-blue",
    "inspired-by": "--color-cyan",
    question: "--color-purple",
    example: "--color-orange",
    implements: "--color-yellow",
};

function basename(path: string): string {
    const file = path.split("/").pop() ?? path;
    return file.replace(/\.md$/i, "");
}

const byStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Pure projection of the {@link KnowledgeModel} into a `{ nodes, links }` shape for the 3D graph view
 * (#280 S1/S2). Nodes are ideas (id = path, name = basename, `val` = degree, `group` = cluster index
 * from {@link buildKnowledgeMap} for coloring, `state`); links are the model's typed relations,
 * **filtered to edges whose target is also a node** so the force layout never gets a dangling
 * reference. Deterministic (sorted) and Obsidian-free; empty model ⇒ empty graph.
 */
export function build3DGraph(model: KnowledgeModel): Graph3DData {
    const ideas = model.all();
    const ids = new Set(ideas.map((idea) => idea.path));

    // Cluster index per note (hub + members share their cluster's index; unclustered → -1).
    const groupOf = new Map<string, number>();
    const map = buildKnowledgeMap(model);
    map.clusters.forEach((cluster, index) => {
        groupOf.set(cluster.hub, index);
        for (const member of cluster.members) groupOf.set(member, index);
    });

    const nodes: Graph3DNode[] = ideas
        .map((idea) => ({
            id: idea.path,
            name: basename(idea.path),
            val: Math.max(1, idea.maturitySignals.degree),
            group: groupOf.get(idea.path) ?? -1,
            state: idea.state,
        }))
        .sort((a, b) => byStr(a.id, b.id));

    const links: Graph3DLink[] = [];
    for (const idea of ideas) {
        const seen = new Set<string>();
        for (const relation of idea.relations) {
            if (!ids.has(relation.to)) continue; // drop dangling targets
            const key = `${relation.to}|${relation.type}`;
            if (seen.has(key)) continue; // one link per (target, type)
            seen.add(key);
            links.push({ source: idea.path, target: relation.to, type: relation.type });
        }
    }
    links.sort((a, b) => byStr(a.source, b.source) || byStr(a.target, b.target) || byStr(a.type, b.type));

    return { nodes, links };
}
