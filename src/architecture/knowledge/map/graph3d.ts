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
     * `graph3dUpToTime` without being threaded through it.
     */
    region: string;
    /**
     * The **neighbourhood** inside that region (#525): a Louvain community index, `-1` when the
     * note is alone, and the community's name — its most connected note — or `""`.
     */
    community: number;
    communityName: string;
    /** The community's hub as a path — the key a renamed region is remembered by (#697). */
    communityHub: string;
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
 * Relation type → Obsidian CSS colour variable (#693): the graph reads the computed value of each,
 * so a link is drawn in the user's theme. An unlisted type falls back to `--text-faint`.
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
    const communityHub = new Map<string, string>();
    communitiesOf(model).forEach((community, index) => {
        const name = basename(community.hub);
        for (const path of [community.hub, ...community.members]) {
            communityOf.set(path, index);
            communityName.set(path, name);
            communityHub.set(path, community.hub);
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
            communityHub: communityHub.get(idea.path) ?? "",
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

/*
 * `capGraph3D` and `GRAPH3D_MAX_NODES = 600` were here from #280 S5 and were **deleted in #539**.
 *
 * They were documented as protecting large vaults, had their own unit tests, and were called by
 * nothing: the view always built its data keeping everything. A capability nothing calls is not a
 * capability (SS XI), and the docs describing it were describing behaviour that did not exist.
 *
 * The alternative -- start applying it -- was the one that needed evidence, because it would have
 * silently hidden 94 % of a ten-thousand-note vault on a surface whose whole purpose is showing
 * *shape*. What could be measured without a screen says the data path is not the problem:
 * `view.graph3d.build.10k` is **27-70 ms across two runs**. Since #693 the scene itself draws in a
 * fixed five calls whatever the vault's size, and the layout runs off the main thread (#694), so
 * the reason a cap was ever wanted is gone with the renderer that needed it.
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
