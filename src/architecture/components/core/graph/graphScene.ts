import type { Graph3DData } from "architecture/knowledge/state";

/** A neighbourhood as the scene draws it: a colour, a name, and the notes inside (#525, #692). */
export interface SceneCommunity {
    /** The palette slot: communities are coloured in order of size, so the biggest get the clearest hues. */
    index: number;
    /** The community's hub note, as a path — the key a renamed region is remembered by (#697). */
    hub: string;
    /** What it is called: the hub's name, or the name you gave it. */
    name: string;
    /** The region (connected component) it nests in, by the region's own hub name. */
    region: string;
    size: number;
}

/**
 * The graph as flat typed arrays (#693, epic #692) — the shape a GPU draws from and a worker lays
 * out, built once per graph and never per frame.
 *
 * Everything the old renderer kept as objects-per-note (`Graph3DNode` with a live `x` mutated by
 * d3) is a column here: one `Float32Array` of positions the layout writes, one `Int32Array` of
 * communities the paint reads. A hover then costs a pass over numbers, not a re-digest of objects.
 */
export interface GraphScene {
    /** Note paths, by scene index. */
    ids: string[];
    /** Note names (basenames), by scene index. */
    names: string[];
    index: Map<string, number>;
    n: number;
    /** Links in the model (the line count drawn). */
    linkCount: number;
    /** Degree per note, at least 1 — sizes the dot. */
    degree: Float32Array;
    /** Palette slot of the note's community, `-1` when the note is alone. */
    community: Int32Array;
    /** The note's state, as written in the vault. */
    state: string[];
    /** Creation time in ms, `0` when unknown (always shown). */
    created: Float64Array;
    /** `1` for a note that is a question (#280). */
    question: Uint8Array;
    /** Endpoints of every link, two scene indices per link. */
    edges: Uint32Array;
    /** Relation type per link (`link` for a plain wikilink). */
    edgeType: string[];
    /** `1` when the link crosses from one community into another (#526). */
    bridge: Uint8Array;
    /** Undirected adjacency in CSR form: `adjacency[offsets[i] .. offsets[i + 1])` are i's neighbours. */
    offsets: Uint32Array;
    adjacency: Uint32Array;
    communities: SceneCommunity[];
    /** Scene indices, best connected first — the notes that earn a label when nothing is asked. */
    hubs: number[];
}

const byStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Pure: the projected graph as columns, communities ranked by size. Never mutates `data`. */
export function buildScene(data: Graph3DData): GraphScene {
    const n = data.nodes.length;
    const ids = data.nodes.map((node) => node.id);
    const names = data.nodes.map((node) => node.name);
    const index = new Map<string, number>();
    ids.forEach((id, i) => index.set(id, i));

    // Communities ranked by size (ties by hub name) so palette slot 0 is the biggest neighbourhood:
    // the clearest colours go where most of the vault is.
    const tally = new Map<number, { hub: string; name: string; region: string; size: number }>();
    for (const node of data.nodes) {
        if (node.community < 0) continue;
        const entry = tally.get(node.community) ?? { hub: node.communityHub, name: node.communityName, region: node.region, size: 0 };
        entry.size++;
        tally.set(node.community, entry);
    }
    const ranked = [...tally.entries()].sort((a, b) => b[1].size - a[1].size || byStr(a[1].name, b[1].name));
    const slotOf = new Map<number, number>();
    const communities: SceneCommunity[] = ranked.map(([community, entry], slot) => {
        slotOf.set(community, slot);
        return { index: slot, hub: entry.hub, name: entry.name, region: entry.region, size: entry.size };
    });

    const degree = new Float32Array(n);
    const community = new Int32Array(n);
    const created = new Float64Array(n);
    const question = new Uint8Array(n);
    const state: string[] = Array.from({ length: n }, () => "");
    data.nodes.forEach((node, i) => {
        degree[i] = Math.max(1, node.val);
        community[i] = node.community < 0 ? -1 : slotOf.get(node.community) ?? -1;
        created[i] = node.created;
        question[i] = node.kind === "question" ? 1 : 0;
        state[i] = node.state;
    });

    // Links whose two ends are both on screen: `build3DGraph` already drops dangling targets, and
    // this is the same guarantee for any caller that filtered nodes on its own.
    const pairs: number[] = [];
    const edgeType: string[] = [];
    const bridgeFlags: number[] = [];
    for (const link of data.links) {
        const a = index.get(link.source);
        const b = index.get(link.target);
        if (a === undefined || b === undefined || a === b) continue;
        pairs.push(a, b);
        edgeType.push(link.type);
        bridgeFlags.push(link.bridge ? 1 : 0);
    }
    const edges = Uint32Array.from(pairs);
    const bridge = Uint8Array.from(bridgeFlags);

    const counts = new Uint32Array(n);
    for (let e = 0; e < edges.length; e += 2) {
        counts[edges[e]]++;
        counts[edges[e + 1]]++;
    }
    const offsets = new Uint32Array(n + 1);
    for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i] + counts[i];
    const adjacency = new Uint32Array(offsets[n]);
    const cursor = offsets.slice(0, n);
    for (let e = 0; e < edges.length; e += 2) {
        const a = edges[e];
        const b = edges[e + 1];
        adjacency[cursor[a]++] = b;
        adjacency[cursor[b]++] = a;
    }

    const hubs = Array.from({ length: n }, (_, i) => i).sort((a, b) => degree[b] - degree[a] || byStr(names[a], names[b]));

    return {
        ids,
        names,
        index,
        n,
        linkCount: edgeType.length,
        degree,
        community,
        state,
        created,
        question,
        edges,
        edgeType,
        bridge,
        offsets,
        adjacency,
        communities,
        hubs,
    };
}

/** A note and the notes one link away, as scene indices. */
export function neighbourhoodOf(scene: GraphScene, i: number): Set<number> {
    const out = new Set<number>([i]);
    for (let k = scene.offsets[i]; k < scene.offsets[i + 1]; k++) out.add(scene.adjacency[k]);
    return out;
}

/** Paths → scene indices, skipping what the scene does not hold. */
export function indicesOf(scene: GraphScene, paths: Iterable<string>): Set<number> {
    const out = new Set<number>();
    for (const path of paths) {
        const i = scene.index.get(path);
        if (i !== undefined) out.add(i);
    }
    return out;
}

/**
 * Where each community sits and how far it spreads, from the current positions — what a nebula is
 * drawn from (#697). `O(n)`, recomputed as the layout moves, never per frame once it has settled.
 */
export function communityBounds(
    scene: GraphScene,
    positions: Float32Array
): { cx: Float32Array; spread: Float32Array; size: Uint32Array } {
    const k = scene.communities.length;
    const cx = new Float32Array(k * 3);
    const size = new Uint32Array(k);
    for (let i = 0; i < scene.n; i++) {
        const c = scene.community[i];
        if (c < 0) continue;
        cx[c * 3] += positions[i * 3];
        cx[c * 3 + 1] += positions[i * 3 + 1];
        cx[c * 3 + 2] += positions[i * 3 + 2];
        size[c]++;
    }
    for (let c = 0; c < k; c++) {
        const s = Math.max(1, size[c]);
        cx[c * 3] /= s;
        cx[c * 3 + 1] /= s;
        cx[c * 3 + 2] /= s;
    }
    const spread = new Float32Array(k);
    for (let i = 0; i < scene.n; i++) {
        const c = scene.community[i];
        if (c < 0) continue;
        const dx = positions[i * 3] - cx[c * 3];
        const dy = positions[i * 3 + 1] - cx[c * 3 + 1];
        const dz = positions[i * 3 + 2] - cx[c * 3 + 2];
        spread[c] += dx * dx + dy * dy + dz * dz;
    }
    for (let c = 0; c < k; c++) spread[c] = Math.sqrt(spread[c] / Math.max(1, size[c]));
    return { cx, spread, size };
}
