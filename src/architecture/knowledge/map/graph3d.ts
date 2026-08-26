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
    /** Discovery-lens flags (#280 S4): no outgoing edges / no incoming edges / in a `contradicts` relation. */
    orphan: boolean;
    deadEnd: boolean;
    contradiction: boolean;
    /** Creation timestamp (ms) — drives the time-lapse; 0 when unknown. */
    created: number;
    /** Note kind for shape/icon differentiation (#280): a question, a source note, or a plain note. */
    kind: NodeKind;
}

/** A note's kind for visual differentiation in the 3D graph. */
export type NodeKind = "note" | "question" | "source";

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

    // Both endpoints of any in-model `contradicts` relation are flagged for the discovery lens (#280 S4).
    const contradicted = new Set<string>();
    for (const idea of ideas) {
        for (const relation of idea.relations) {
            if (relation.type === "contradicts" && ids.has(relation.to)) {
                contradicted.add(idea.path);
                contradicted.add(relation.to);
            }
        }
    }

    const nodes: Graph3DNode[] = ideas
        .map((idea): Graph3DNode => ({
            id: idea.path,
            name: basename(idea.path),
            val: Math.max(1, idea.maturitySignals.degree),
            group: groupOf.get(idea.path) ?? -1,
            state: idea.state,
            orphan: model.outNeighborSet(idea.path).size === 0,
            deadEnd: model.inNeighborSet(idea.path).size === 0,
            contradiction: contradicted.has(idea.path),
            created: idea.created ?? 0,
            kind: idea.relations.some((r) => r.type === "question")
                ? "question"
                : idea.maturitySignals.hasSources ? "source" : "note",
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

/**
 * Knowledge-**state** → colour var (#280 iteration): a maturity ramp from raw (red) through developing
 * (yellow) to permanent/evergreen (green/cyan). This is the differentiator over a plain link graph —
 * the 3D view can show *how mature your thinking is* at a glance. Unknown states fall back to muted.
 */
export const STATE_COLOR_VARS: Record<string, string> = {
    fleeting: "--color-red",
    literature: "--color-orange",
    developing: "--color-yellow",
    permanent: "--color-green",
    evergreen: "--color-cyan",
    archived: "--text-faint",
};
export const DEFAULT_STATE_COLOR_VAR = "--text-muted";

/**
 * Concrete colours tuned for the 3D view's **fixed dark background** (#280 iteration). Theme text vars
 * like `--text-faint` are near-black on dark themes, so links/nodes must not use them here — these hex
 * values stay legible (and subtle for plain links) whatever the user's theme. The `*_VARS` maps still
 * drive the legend swatches (kept in sync by `graph3d.scss`).
 */
export const RELATION_COLORS: Record<string, string> = {
    link: "#8b93a7",        // subtle steel-grey for plain wikilinks (the majority)
    supports: "#4ade80",
    contradicts: "#f87171",
    expands: "#60a5fa",
    "inspired-by": "#22d3ee",
    question: "#c084fc",
    example: "#fb923c",
    implements: "#facc15",
};

export const STATE_COLORS: Record<string, string> = {
    fleeting: "#f87171",
    literature: "#fb923c",
    developing: "#facc15",
    permanent: "#4ade80",
    evergreen: "#22d3ee",
    archived: "#94a3b8",
};
export const DEFAULT_STATE_COLOR = "#cbd5e1";

/** Aggregate discovery counts for the lens chips (#280 iteration). */
export interface Graph3DStats {
    orphans: number;
    deadEnds: number;
    contradictions: number;
}

/** Count the discovery-lens categories across the graph. Pure. */
export function graph3dStats(data: Graph3DData): Graph3DStats {
    let orphans = 0, deadEnds = 0, contradictions = 0;
    for (const node of data.nodes) {
        if (node.orphan) orphans++;
        if (node.deadEnd) deadEnds++;
        if (node.contradiction) contradictions++;
    }
    return { orphans, deadEnds, contradictions };
}

/**
 * Breadth-first **shortest path** between two notes over the undirected adjacency (#280 iteration) —
 * the sequence of ids from `from` to `to` inclusive, or `[]` when unreachable. Pure.
 */
export function shortestPath(adjacency: Map<string, Set<string>>, from: string, to: string): string[] {
    if (from === to) return [from];
    const prev = new Map<string, string>();
    const seen = new Set<string>([from]);
    const queue: string[] = [from];
    while (queue.length > 0) {
        const current = queue.shift() as string;
        for (const next of adjacency.get(current) ?? []) {
            if (seen.has(next)) continue;
            seen.add(next);
            prev.set(next, current);
            queue.push(next);
        }
    }
    if (!prev.has(to)) return [];
    const path = [to];
    let cursor = to;
    while (prev.has(cursor)) {
        cursor = prev.get(cursor) as string;
        path.push(cursor);
    }
    return path.reverse();
}

/** Undirected adjacency (id → neighbour ids) for hover-neighbourhood highlighting. Pure. */
export function buildAdjacency(data: Graph3DData): Map<string, Set<string>> {
    const adjacency = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
        const set = adjacency.get(a) ?? new Set<string>();
        set.add(b);
        adjacency.set(a, set);
    };
    for (const edge of data.links) {
        link(edge.source, edge.target);
        link(edge.target, edge.source);
    }
    return adjacency;
}

/** Default cap on rendered nodes (#280 S5) — keeps large vaults responsive; see {@link capGraph3D}. */
export const GRAPH3D_MAX_NODES = 600;

/**
 * Cap the graph to the `max` most-connected nodes (level-of-detail for large vaults, #280 S5). When the
 * graph already fits, it is returned unchanged. Otherwise the top `max` nodes by `val` (degree, then id
 * for determinism) are kept and links are pruned to surviving endpoints. Pure; never mutates the input.
 */
export function capGraph3D(data: Graph3DData, max: number = GRAPH3D_MAX_NODES): Graph3DData {
    if (data.nodes.length <= max) return data;
    const nodes = [...data.nodes]
        .sort((a, b) => b.val - a.val || byStr(a.id, b.id))
        .slice(0, max);
    const kept = new Set(nodes.map((node) => node.id));
    const links = data.links.filter((link) => kept.has(link.source) && kept.has(link.target));
    // Re-sort kept nodes by id so the capped output keeps the stable ordering callers expect.
    nodes.sort((a, b) => byStr(a.id, b.id));
    return { nodes, links };
}

/** The discovery-lens overlays (#280 S4) — each highlights an actionable class of note in space. */
export type OverlayKind = "orphans" | "dead-ends" | "contradictions";
export const OVERLAY_KINDS: readonly OverlayKind[] = ["orphans", "dead-ends", "contradictions"];

export interface OverlaySpec {
    /** i18n label key for the toggle option. */
    labelKey: string;
    /** Obsidian CSS colour var used to highlight matching nodes (dims the rest). */
    colorVar: string;
    /** Whether a node belongs to this overlay. */
    matches: (node: Graph3DNode) => boolean;
}

/** Overlay kind → its label, highlight colour and match predicate. Pure; shared by the renderer. */
export const OVERLAY_SPECS: Record<OverlayKind, OverlaySpec> = {
    "orphans": { labelKey: "graph3d_overlay_orphans", colorVar: "--color-orange", matches: (n) => n.orphan },
    "dead-ends": { labelKey: "graph3d_overlay_dead_ends", colorVar: "--color-yellow", matches: (n) => n.deadEnd },
    "contradictions": { labelKey: "graph3d_overlay_contradictions", colorVar: "--color-red", matches: (n) => n.contradiction },
};

/** Filter criteria for {@link filterGraph3D} (#280 S3) — all optional; an absent/blank field matches all. */
export interface Graph3DFilter {
    /** Case-insensitive substring match on the node name. */
    query?: string;
    /** Exact match on the idea state. */
    state?: string;
    /** Path prefix (folder) match on the node id. */
    folder?: string;
}

/**
 * Pure filter over {@link Graph3DData} (#280 S3): keeps nodes matching every provided criterion, then
 * keeps only links whose **both** endpoints survive. Blank/absent criteria match everything. Never
 * mutates the input.
 */
export function filterGraph3D(data: Graph3DData, filter: Graph3DFilter): Graph3DData {
    const query = (filter.query ?? "").trim().toLowerCase();
    const state = (filter.state ?? "").trim();
    const folder = (filter.folder ?? "").trim();

    const nodes = data.nodes.filter((node) => {
        if (query && !node.name.toLowerCase().includes(query)) return false;
        if (state && node.state !== state) return false;
        if (folder && !node.id.startsWith(folder)) return false;
        return true;
    });
    const kept = new Set(nodes.map((node) => node.id));
    const links = data.links.filter((link) => kept.has(link.source) && kept.has(link.target));

    return { nodes, links };
}

/**
 * A stable content signature of the graph's *shape* (sorted node ids + sorted link keys), so the view
 * can skip a full re-layout when an index update didn't actually change the graph (#280 stability).
 */
export function graph3dSignature(data: Graph3DData): string {
    const nodes = data.nodes.map((n) => n.id).sort().join("|");
    const links = data.links.map((l) => `${l.source}>${l.target}:${l.type}`).sort().join("|");
    return `${data.nodes.length}#${nodes}##${data.links.length}#${links}`;
}

/** Min/max creation timestamp across nodes with a known `created` (ignores 0). Empty ⇒ both 0. */
export function graph3dTimeRange(data: Graph3DData): { min: number; max: number } {
    let min = Infinity, max = 0;
    for (const node of data.nodes) {
        if (node.created > 0) {
            if (node.created < min) min = node.created;
            if (node.created > max) max = node.created;
        }
    }
    return Number.isFinite(min) ? { min, max } : { min: 0, max: 0 };
}

/**
 * The graph as it existed up to `cursor` (ms) — nodes created at/before the cursor (unknown `created`
 * of 0 always shown as pre-existing), with links between surviving nodes. Powers the time-lapse.
 */
export function graph3dUpToTime(data: Graph3DData, cursor: number): Graph3DData {
    const nodes = data.nodes.filter((node) => node.created === 0 || node.created <= cursor);
    const kept = new Set(nodes.map((node) => node.id));
    const links = data.links.filter((link) => kept.has(link.source) && kept.has(link.target));
    return { nodes, links };
}
