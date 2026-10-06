import type { GraphScene } from "./graphScene";
import { seedPositions } from "./layoutCore";

/**
 * Where the notes were (#694): the last few layouts, kept for the session, so reopening Explore
 * on a vault that has not changed is instant — no reflow, no second wait — and a vault that changed
 * a little starts from where it was and only settles the difference.
 */
interface Remembered {
    ids: string[];
    positions: Float32Array;
}

const KEEP = 4;
const cache = new Map<string, Remembered>();
let last: Remembered | null = null;

/** FNV-1a over the graph's shape: the same notes and links give the same key. */
export function layoutKey(scene: GraphScene): string {
    // Inlined on purpose: a closure call per character cost 35 ms at ten thousand notes.
    let h = 0x811c9dc5 | 0;
    const ids = scene.ids;
    for (let k = 0; k < ids.length; k++) {
        const id = ids[k];
        for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
        h = Math.imul(h, 0x01000193);
    }
    const edges = scene.edges;
    for (let e = 0; e < edges.length; e++) h = Math.imul(h ^ edges[e], 0x01000193);
    return `${scene.n}:${edges.length}:${(h >>> 0).toString(16)}`;
}

export function recallLayout(key: string): Float32Array | null {
    const hit = cache.get(key);
    if (!hit) return null;
    // Most recently used goes last, so the oldest is the one to drop.
    cache.delete(key);
    cache.set(key, hit);
    return hit.positions.slice();
}

export function rememberLayout(key: string, scene: GraphScene, positions: Float32Array): void {
    const entry = { ids: scene.ids.slice(), positions: positions.slice() };
    cache.delete(key);
    cache.set(key, entry);
    while (cache.size > KEEP) cache.delete(cache.keys().next().value as string);
    last = entry;
}

/** For tests: start from nothing. */
export function forgetLayouts(): void {
    cache.clear();
    last = null;
}

/**
 * Where to start a graph that is not in the cache: notes the previous layout knew keep their place,
 * a new note starts beside the neighbours it links to, and the temperature says how much is left to
 * settle. With nothing known it is the community seed, from scratch.
 */
export function warmStart(scene: GraphScene, seed = 7): { initial: Float32Array; alpha: number; known: number } {
    const initial = seedPositions({ n: scene.n, community: scene.community, communityCount: scene.communities.length, seed });
    if (!last) return { initial, alpha: 1, known: 0 };
    const previous = new Map<string, number>();
    last.ids.forEach((id, i) => previous.set(id, i));
    const known = new Uint8Array(scene.n);
    let count = 0;
    for (let i = 0; i < scene.n; i++) {
        const at = previous.get(scene.ids[i]);
        if (at === undefined) continue;
        initial[i * 3] = last.positions[at * 3];
        initial[i * 3 + 1] = last.positions[at * 3 + 1];
        initial[i * 3 + 2] = last.positions[at * 3 + 2];
        known[i] = 1;
        count++;
    }
    if (count === 0) return { initial, alpha: 1, known: 0 };
    for (let i = 0; i < scene.n; i++) {
        if (known[i]) continue;
        let x = 0, y = 0, z = 0, m = 0;
        for (let k = scene.offsets[i]; k < scene.offsets[i + 1]; k++) {
            const j = scene.adjacency[k];
            if (!known[j]) continue;
            x += initial[j * 3];
            y += initial[j * 3 + 1];
            z += initial[j * 3 + 2];
            m++;
        }
        if (m > 0) {
            // Beside its neighbours, nudged so two new notes never start on the same spot.
            initial[i * 3] = x / m + ((i * 7) % 11) - 5;
            initial[i * 3 + 1] = y / m + ((i * 13) % 11) - 5;
            initial[i * 3 + 2] = z / m + ((i * 17) % 11) - 5;
        }
    }
    const share = count / Math.max(1, scene.n);
    return { initial, alpha: share > 0.95 ? 0.18 : share > 0.7 ? 0.4 : share > 0.3 ? 0.7 : 1, known: count };
}
