import type { KnowledgeModel } from "../model/KnowledgeModel";
import { buildKnowledgeMap } from "./knowledgeMap";
import { communitiesOf } from "./communities";

/** A node in the 3D graph — identity is the vault `path`; `name` labels it, `val` sizes it. */
export interface Graph3DNode {
    id: string;
    name: string;
    /** Relative size (node degree, min 1). */
    val: number;
    /** Region index for colouring, or -1 when the note is alone (no link to anything in the model). */
    group: number;
    /**
     * The region's **name** — its most connected note (#514). Empty when the note is alone.
     *
     * It rides on the node rather than sitting on {@link Graph3DData} so it survives
     * `filterGraph3D` and `graph3dUpToTime` without being threaded through any of them.
     */
    region: string;
    /**
     * The **neighbourhood** inside that region (#525): a Louvain community index, `-1` when the
     * note is alone, and the community's name — its most connected note — or `""`.
     */
    community: number;
    communityName: string;
    /** The idea's workflow state (for optional coloring / filtering). */
    state: string;
    /** Discovery-lens flags (#280 S4): no outgoing edges / no incoming edges / in a `contradicts` relation. */
    orphan: boolean;
    deadEnd: boolean;
    contradiction: boolean;
    /**
     * This note's neighbours are not all from its own community (#525) — it sits where two
     * neighbourhoods meet. Precomputed here because an {@link OverlaySpec} predicate is handed one
     * node and cannot see a neighbour, which is the same reason `orphan` and `deadEnd` are flags.
     */
    frontier: boolean;
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
    /**
     * This link crosses from one neighbourhood into another (#526) — its endpoints are in
     * different Louvain communities. A flag on the edge for the same reason `frontier` is a flag
     * on the node: an {@link OverlaySpec} predicate is handed one thing and cannot look around it.
     */
    bridge: boolean;
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
 * A link endpoint's id. Links are built with string `source`/`target`, but the force layout
 * (`d3-force` via `3d-force-graph`) mutates them **in place** into the resolved node objects. These
 * pure filters run on that same live data during the time-lapse, so read the id either way — otherwise
 * `kept.has(link.source)` compares a Set of ids against a node object and drops every link (#394).
 */
function linkEndId(end: unknown): string {
    return typeof end === "object" && end !== null ? (end as { id?: string }).id ?? "" : String(end);
}

/**
 * Pure projection of the {@link KnowledgeModel} into a `{ nodes, links }` shape for the 3D graph view
 * (#280 S1/S2). Nodes are ideas (id = path, name = basename, `val` = degree, `group`/`region` = the
 * connected region from {@link buildKnowledgeMap} (#513/#514), `state`); links are the model's typed relations,
 * **filtered to edges whose target is also a node** so the force layout never gets a dangling
 * reference. Deterministic (sorted) and Obsidian-free; empty model ⇒ empty graph.
 */
export function build3DGraph(model: KnowledgeModel): Graph3DData {
    const ideas = model.all();
    const ids = new Set(ideas.map((idea) => idea.path));

    // Region index and name per note (#513/#514): a region is a connected component, named after
    // its most connected note; a note with no link in the model gets -1 and no name.
    const groupOf = new Map<string, number>();
    const regionOf = new Map<string, string>();
    const map = buildKnowledgeMap(model);
    map.clusters.forEach((cluster, index) => {
        const name = basename(cluster.hub);
        for (const path of [cluster.hub, ...cluster.members]) {
            groupOf.set(path, index);
            regionOf.set(path, name);
        }
    });

    // The neighbourhoods inside each region (#525), and which notes straddle two of them. The
    // frontier test reuses the neighbour sets `orphan`/`deadEnd` already read, so the extra
    // information costs one more lookup per edge and no second traversal.
    const communityOf = new Map<string, number>();
    const communityName = new Map<string, string>();
    communitiesOf(model).forEach((community, index) => {
        const name = basename(community.hub);
        for (const path of [community.hub, ...community.members]) {
            communityOf.set(path, index);
            communityName.set(path, name);
        }
    });
    const spansTwo = (path: string): boolean => {
        const own = communityOf.get(path);
        if (own === undefined) return false; // alone: no neighbour, so nothing to straddle
        for (const set of [model.outNeighborSet(path), model.inNeighborSet(path)]) {
            for (const other of set) {
                const theirs = communityOf.get(other);
                if (theirs !== undefined && theirs !== own) return true;
            }
        }
        return false;
    };

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
            region: regionOf.get(idea.path) ?? "",
            community: communityOf.get(idea.path) ?? -1,
            communityName: communityName.get(idea.path) ?? "",
            state: idea.state,
            orphan: model.outNeighborSet(idea.path).size === 0,
            deadEnd: model.inNeighborSet(idea.path).size === 0,
            contradiction: contradicted.has(idea.path),
            frontier: spansTwo(idea.path),
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
            const from = communityOf.get(idea.path);
            const to = communityOf.get(relation.to);
            const bridge = from !== undefined && to !== undefined && from !== to;
            links.push({ source: idea.path, target: relation.to, type: relation.type, bridge });
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

/**
 * The **community** palette (#515, retargeted by #527). Eighteen colours tuned for the view's
 * fixed dark background.
 *
 * It used to be generated — `hsl((group * 67) % 360, 70%, 62%)` — in two places that had drifted
 * four per cent apart, so a node and its own hull were different colours. A generated hue also
 * cannot reach a stylesheet without an inline style, which this repo forbids, so the legend
 * swatch could never match the scene. A fixed list fixes both: `graph3d.scss` mirrors it in
 * `graph3d-swatch--community-N`, and a guardrail test keeps the two in step.
 *
 * Eighteen because the reference vault has **17 communities** (#524) and twelve would have put two
 * neighbourhoods side by side in one hue. Past eighteen it wraps, because a palette cannot be
 * unbounded and two *distant* communities sharing a colour is the right failure to accept.
 */
export const COMMUNITY_COLORS: readonly string[] = [
    "#7dd3fc", // sky
    "#86efac", // green
    "#fcd34d", // amber
    "#f0abfc", // fuchsia
    "#fda4af", // rose
    "#a5b4fc", // indigo
    "#5eead4", // teal
    "#fdba74", // orange
    "#d8b4fe", // purple
    "#bef264", // lime
    "#67e8f9", // cyan
    "#f9a8d4", // pink
    "#93c5fd", // blue
    "#6ee7b7", // emerald
    "#fde68a", // yellow
    "#c4b5fd", // violet
    "#f8b4a0", // salmon
    "#a7f3d0", // mint
];

/** A note that is alone belongs to no community — grey, and it means something (#513). */
export const ALONE_COLOR = "#9aa4b8";

/** The one colour a community is drawn in: node, halo, hull, scene label and legend swatch (#515). */
export function communityColor(group: number): string {
    return group < 0 ? ALONE_COLOR : COMMUNITY_COLORS[group % COMMUNITY_COLORS.length];
}

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
    /** Notes with no link to anything else in the model (#516) — 19 % of the reference vault. */
    alone: number;
    /** Notes whose neighbours are not all from their own community (#525) — 48 in the reference vault. */
    frontier: number;
    /** Links crossing from one community into another (#526) — 26 in the reference vault. */
    bridges: number;
}

/** Count the discovery-lens categories across the graph. Pure. */
export function graph3dStats(data: Graph3DData): Graph3DStats {
    let orphans = 0, deadEnds = 0, contradictions = 0, alone = 0, frontier = 0;
    for (const node of data.nodes) {
        if (node.orphan) orphans++;
        if (node.deadEnd) deadEnds++;
        if (node.contradiction) contradictions++;
        if (node.group < 0) alone++;
        if (node.frontier) frontier++;
    }
    let bridges = 0;
    for (const link of data.links) if (link.bridge) bridges++;
    return { orphans, deadEnds, contradictions, alone, frontier, bridges };
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

/*
 * `capGraph3D` and `GRAPH3D_MAX_NODES = 600` were here from #280 S5 and were **deleted in #539**.
 *
 * They were documented as protecting large vaults, had their own unit tests, and were called by
 * nothing: the view has always built its data with `filterGraph3D(baseData(), {})`, which keeps
 * everything. A capability nothing calls is not a capability (SS XI), and the docs describing it
 * were describing behaviour that did not exist.
 *
 * The alternative -- start applying it -- was the one that needed evidence, because it would have
 * silently hidden 94 % of a ten-thousand-note vault on a surface whose whole purpose is showing
 * *shape*. What could be measured without a screen says the data path is not the problem:
 * `view.graph3d.build.10k` is **27-70 ms across two runs**. What could not be measured is frames per second, and the
 * cap's stated reason -- mobile -- does not apply either: `render()` sends mobile to the 2D
 * fallback and never reaches WebGL.
 *
 * If a real vault ever does choke the scene, the fix starts with that report and a number, not with
 * a constant nobody ever called.
 */

/** The discovery-lens overlays (#280 S4) — each highlights an actionable class of note in space. */
export type OverlayKind = "orphans" | "dead-ends" | "contradictions" | "alone" | "frontier" | "bridges" | "gaps";
export const OVERLAY_KINDS: readonly OverlayKind[] = ["orphans", "dead-ends", "contradictions", "alone", "frontier", "bridges", "gaps"];

/** A lens about **notes**: matching nodes are lit and the rest dim. */
export interface NodeOverlay {
    /** i18n label key for the toggle option. */
    labelKey: string;
    /** Obsidian CSS colour var used to highlight what matches (dims the rest). */
    colorVar: string;
    on: "node";
    matches: (node: Graph3DNode) => boolean;
}

/**
 * A lens about **links** (#526): matching edges are drawn bright and thick, their endpoints stay
 * lit, and everything else dims. The first statement this table could not make about notes.
 */
export interface EdgeOverlay {
    labelKey: string;
    colorVar: string;
    on: "edge";
    matches: (edge: Graph3DLink) => boolean;
}

/**
 * A lens about **candidates** (#532, epic #529): edges that are *not* in the graph -- pairs of
 * notes that share context and were never linked.
 *
 * It carries **no `matches`**, and that is the whole distinction rather than an omission. The other
 * two kinds narrow what is already in {@link Graph3DData}; there is nothing in it to match here,
 * because the thing this lens draws does not exist. What to draw comes from the gap projection and
 * is selected against the nodes on screen, which is why the renderer branches once per *kind* and
 * not once per lens.
 */
export interface CandidateOverlay {
    labelKey: string;
    colorVar: string;
    on: "candidate";
}

export type OverlaySpec = NodeOverlay | EdgeOverlay | CandidateOverlay;

/** Overlay kind → its label, highlight colour and match predicate. Pure; shared by the renderer. */
export const OVERLAY_SPECS: Record<OverlayKind, OverlaySpec> = {
    "orphans": { labelKey: "graph3d_overlay_orphans", colorVar: "--color-orange", on: "node", matches: (n) => n.orphan },
    "dead-ends": { labelKey: "graph3d_overlay_dead_ends", colorVar: "--color-yellow", on: "node", matches: (n) => n.deadEnd },
    "contradictions": { labelKey: "graph3d_overlay_contradictions", colorVar: "--color-red", on: "node", matches: (n) => n.contradiction },
    // Read from `group`, not from `orphan && deadEnd` (#516): those read `outAdj`/`inAdj`, which
    // record a link's target whether or not it is an idea, so a note linking only outside the
    // scope is `orphan === false` and has no neighbour here. The lens wants the graph sense.
    "alone": { labelKey: "graph3d_overlay_alone", colorVar: "--text-muted", on: "node", matches: (n) => n.group < 0 },
    // Where two neighbourhoods meet (#525). A crossing has two sides, so both show.
    "frontier": { labelKey: "graph3d_overlay_frontier", colorVar: "--color-cyan", on: "node", matches: (n) => n.frontier },
    // The crossings themselves (#526) — the first lens about links rather than notes.
    "bridges": { labelKey: "graph3d_overlay_bridges", colorVar: "--color-purple", on: "edge", matches: (e) => e.bridge },
    // And the crossings that are missing (#532): a pair that shares context and was never linked.
    // No predicate, because there is nothing in the graph to run it against.
    "gaps": { labelKey: "graph3d_overlay_gaps", colorVar: "--color-pink", on: "candidate" },
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
    const links = data.links.filter((link) => kept.has(linkEndId(link.source)) && kept.has(linkEndId(link.target)));

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
    const links = data.links.filter((link) => kept.has(linkEndId(link.source)) && kept.has(linkEndId(link.target)));
    return { nodes, links };
}

/** A single stop in the cinematic tour (#385) — the note the camera flies to. */
export interface TourStop {
    id: string;
    name: string;
}

/** Options for {@link tourStops}. */
export interface TourOptions {
    /** Maximum number of stops in the tour. */
    maxStops?: number;
}

/** Default cap on tour stops — a watchable flight, not the whole vault. */
export const TOUR_MAX_STOPS = 12;

/**
 * The ordered list of notes a **cinematic tour** (#385) flies through — a **pure, deterministic**
 * function of the graph so the choreography is unit-testable (the camera flight itself is manual).
 * Roughly half the stops are the **hubs** (highest `val` = degree), the rest the **most-recent** notes
 * (highest `created`); the two are merged, **deduplicated** (a note that is both appears once) and
 * **capped** at `maxStops`. Every ordering ties break by `name` then `id`, so the same graph always
 * yields the same tour. An empty graph yields no stops.
 */
export function tourStops(data: Graph3DData, opts: TourOptions = {}): TourStop[] {
    const max = opts.maxStops ?? TOUR_MAX_STOPS;
    if (max <= 0 || data.nodes.length === 0) return [];

    const byVal = [...data.nodes].sort((a, b) => b.val - a.val || byStr(a.name, b.name) || byStr(a.id, b.id));
    const byRecent = [...data.nodes]
        .filter((node) => node.created > 0)
        .sort((a, b) => b.created - a.created || byStr(a.name, b.name) || byStr(a.id, b.id));

    const ordered: Graph3DNode[] = [];
    const seen = new Set<string>();
    const push = (node: Graph3DNode): void => {
        if (seen.has(node.id)) return;
        seen.add(node.id);
        ordered.push(node);
    };

    const hubQuota = Math.ceil(max / 2);
    for (let i = 0; i < byVal.length && ordered.length < hubQuota; i++) push(byVal[i]); // top hubs first
    for (let i = 0; i < byRecent.length && ordered.length < max; i++) push(byRecent[i]); // then recent
    for (let i = 0; i < byVal.length && ordered.length < max; i++) push(byVal[i]); // fill any remainder

    return ordered.slice(0, max).map((node) => ({ id: node.id, name: node.name }));
}
