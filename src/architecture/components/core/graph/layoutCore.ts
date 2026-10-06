/**
 * The force layout (#693, #694) — pure, allocation-free per tick, and self-contained so a Web
 * Worker can run it off the main thread.
 *
 * It replaces `d3-force-3d` as driven by `3d-force-graph`, which measured **16.8 ms a tick at 2,000
 * notes and 131 ms at 10,000** on the main thread — a whole frame or eight frames, for five to nine
 * seconds, every time the view opened. Three changes do the work:
 *
 * - **typed arrays and a pooled octree** (Barnes–Hut, θ = 0.9): no object per note, nothing
 *   allocated per tick, so the garbage collector never joins the animation;
 * - **seeded by community**: every neighbourhood starts on its own spot of a sphere, so the layout
 *   spends its ticks settling rather than untangling, and stops sooner;
 * - **a pull toward the community's own centre**: regions read as places, which is what a nebula
 *   is drawn around (#697).
 *
 * Deterministic: the same graph and seed always give the same picture.
 */

export interface LayoutInput {
    n: number;
    /** Two scene indices per link. */
    edges: Uint32Array;
    /** Palette slot per note, `-1` when alone. */
    community: Int32Array;
    communityCount: number;
    /** Where to start, when a previous layout of (most of) this graph is known (#694 cache). */
    initial?: Float32Array;
    /** Starting temperature: `1` from scratch, lower to only settle a known layout. */
    alpha?: number;
    seed?: number;
}

export interface Layout {
    positions: Float32Array;
    /** One step. Returns the temperature left; the layout has settled below {@link ALPHA_MIN}. */
    tick(): number;
    readonly alpha: number;
    readonly ticks: number;
    settled(): boolean;
}

export const ALPHA_MIN = 0.002;
/** How many ticks a layout from scratch takes to cool to {@link ALPHA_MIN}. */
export const LAYOUT_TICKS = 260;
const ALPHA_DECAY = 1 - Math.pow(ALPHA_MIN, 1 / LAYOUT_TICKS);
const VELOCITY_KEEP = 0.58;
const THETA2 = 1;
const CHARGE = -42;
const LINK_IN = 26;
const LINK_ACROSS = 90;
const COHESION = 0.045;
const GRAVITY = 0.006;
const DIST_MIN2 = 1;

/** A small seeded generator (mulberry32): the layout must not depend on `Math.random`. */
export function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** How big the picture is for `n` notes — every distance in the layout scales with it. */
export function layoutRadius(n: number): number {
    return 140 + 22 * Math.sqrt(Math.max(1, n));
}

/**
 * Where each note starts (#694): communities on a Fibonacci sphere, members in a cloud around their
 * centre sized by the community, notes that are alone on a loose outer shell. Pure.
 */
export function seedPositions(input: Pick<LayoutInput, "n" | "community" | "communityCount" | "seed">): Float32Array {
    const { n, community, communityCount } = input;
    const random = rng(input.seed ?? 7);
    const gauss = () => {
        let u = 0, v = 0;
        while (u === 0) u = random();
        while (v === 0) v = random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    const size = new Uint32Array(Math.max(1, communityCount));
    for (let i = 0; i < n; i++) if (community[i] >= 0) size[community[i]]++;
    const radius = layoutRadius(n);
    const centres = new Float32Array(Math.max(1, communityCount) * 3);
    const golden = Math.PI * (1 + Math.sqrt(5));
    for (let c = 0; c < communityCount; c++) {
        const phi = Math.acos(1 - (2 * (c + 0.5)) / Math.max(1, communityCount));
        const theta = golden * c;
        // The biggest communities sit nearer the middle, the small ones further out.
        const r = radius * (communityCount === 1 ? 0 : 0.55 + 0.45 * (c / Math.max(1, communityCount - 1)));
        centres[c * 3] = Math.cos(theta) * Math.sin(phi) * r;
        centres[c * 3 + 1] = Math.cos(phi) * r * 0.7;
        centres[c * 3 + 2] = Math.sin(theta) * Math.sin(phi) * r;
    }
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        const c = community[i];
        if (c >= 0) {
            const sigma = 8 + 4.5 * Math.sqrt(size[c]);
            out[i * 3] = centres[c * 3] + gauss() * sigma;
            out[i * 3 + 1] = centres[c * 3 + 1] + gauss() * sigma;
            out[i * 3 + 2] = centres[c * 3 + 2] + gauss() * sigma;
        } else {
            const phi = Math.acos(2 * random() - 1);
            const theta = random() * Math.PI * 2;
            const r = radius * (1.15 + random() * 0.35);
            out[i * 3] = Math.cos(theta) * Math.sin(phi) * r;
            out[i * 3 + 1] = Math.cos(phi) * r * 0.7;
            out[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * r;
        }
    }
    return out;
}

/** Build a layout. The returned object owns its arrays; `positions` is updated in place by `tick`. */
export function createLayout(input: LayoutInput): Layout {
    const { n, edges, community, communityCount } = input;
    const positions = input.initial && input.initial.length === n * 3 ? input.initial : seedPositions(input);
    const velocity = new Float32Array(n * 3);
    let alpha = input.alpha ?? 1;
    let ticks = 0;

    // Link strengths and biases, d3's defaults: a link to a hub pulls the hub less.
    const count = new Uint32Array(n);
    for (let e = 0; e < edges.length; e += 2) {
        count[edges[e]]++;
        count[edges[e + 1]]++;
    }
    const linkCount = edges.length / 2;
    const linkStrength = new Float32Array(linkCount);
    const linkBias = new Float32Array(linkCount);
    const linkLength = new Float32Array(linkCount);
    for (let l = 0; l < linkCount; l++) {
        const a = edges[l * 2], b = edges[l * 2 + 1];
        linkStrength[l] = 1 / Math.max(1, Math.min(count[a], count[b]));
        linkBias[l] = count[a] / Math.max(1, count[a] + count[b]);
        linkLength[l] = community[a] >= 0 && community[a] === community[b] ? LINK_IN : LINK_ACROSS;
    }

    const k = Math.max(1, communityCount);
    const centre = new Float32Array(k * 3);
    const members = new Uint32Array(k);

    // The octree, pooled: every array is sized once and reused by every tick.
    let capacity = Math.max(64, n * 4);
    let child = new Int32Array(capacity * 8);
    let body = new Int32Array(capacity);
    let mass = new Float32Array(capacity);
    let mx = new Float32Array(capacity);
    let my = new Float32Array(capacity);
    let mz = new Float32Array(capacity);
    let half = new Float32Array(capacity);
    let ox = new Float32Array(capacity);
    let oy = new Float32Array(capacity);
    let oz = new Float32Array(capacity);
    /** `1` once a cell has children — a leaf test without reading eight slots. */
    let inner = new Uint8Array(capacity);
    let used = 0;
    const stack = new Int32Array(4096);

    const grow = () => {
        const next = capacity * 2;
        const copy = <T extends Int32Array | Float32Array | Uint8Array>(arr: T, size: number): T => {
            const out = new (arr.constructor as { new (size: number): T })(size);
            out.set(arr);
            return out;
        };
        child = copy(child, next * 8);
        body = copy(body, next);
        mass = copy(mass, next);
        mx = copy(mx, next);
        my = copy(my, next);
        mz = copy(mz, next);
        half = copy(half, next);
        ox = copy(ox, next);
        oy = copy(oy, next);
        oz = copy(oz, next);
        inner = copy(inner, next);
        capacity = next;
    };

    const alloc = (cx: number, cy: number, cz: number, h: number): number => {
        if (used >= capacity) grow();
        const node = used++;
        child.fill(-1, node * 8, node * 8 + 8);
        body[node] = -1;
        inner[node] = 0;
        mass[node] = 0;
        mx[node] = 0;
        my[node] = 0;
        mz[node] = 0;
        half[node] = h;
        ox[node] = cx;
        oy[node] = cy;
        oz[node] = cz;
        return node;
    };

    const octant = (node: number, x: number, y: number, z: number): number =>
        (x >= ox[node] ? 1 : 0) | (y >= oy[node] ? 2 : 0) | (z >= oz[node] ? 4 : 0);

    const childFor = (node: number, slot: number): number => {
        const existing = child[node * 8 + slot];
        if (existing >= 0) return existing;
        const h = half[node] / 2;
        const made = alloc(
            ox[node] + (slot & 1 ? h : -h),
            oy[node] + (slot & 2 ? h : -h),
            oz[node] + (slot & 4 ? h : -h),
            h
        );
        child[node * 8 + slot] = made;
        inner[node] = 1;
        return made;
    };

    const insert = (i: number): void => {
        const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
        let node = 0;
        for (let depth = 0; depth < 48; depth++) {
            const isLeaf = inner[node] === 0;
            if (isLeaf && mass[node] === 0) {
                body[node] = i;
                mass[node] = 1;
                mx[node] = x;
                my[node] = y;
                mz[node] = z;
                return;
            }
            if (isLeaf && body[node] >= 0 && half[node] > 1e-3) {
                // Split: the body that lived here moves down one level, then this one follows.
                const j = body[node];
                body[node] = -1;
                const jx = positions[j * 3], jy = positions[j * 3 + 1], jz = positions[j * 3 + 2];
                const target = childFor(node, octant(node, jx, jy, jz));
                body[target] = j;
                mass[target] = 1;
                mx[target] = jx;
                my[target] = jy;
                mz[target] = jz;
            } else if (isLeaf) {
                // Two notes in the same place: keep them as one heavier body rather than recurse forever.
                mass[node] += 1;
                mx[node] += x;
                my[node] += y;
                mz[node] += z;
                return;
            }
            mass[node] += 1;
            mx[node] += x;
            my[node] += y;
            mz[node] += z;
            node = childFor(node, octant(node, x, y, z));
        }
    };

    const build = (): void => {
        let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < n; i++) {
            const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        }
        const h = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1) / 2 + 1;
        used = 0;
        alloc((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2, h);
        for (let i = 0; i < n; i++) insert(i);
        // Sums become centres once, rather than once per visit of every traversal.
        for (let node = 0; node < used; node++) {
            const m = mass[node];
            if (m === 0) continue;
            mx[node] /= m;
            my[node] /= m;
            mz[node] /= m;
        }
    };

    const repel = (i: number, strength: number): void => {
        const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
        let fx = 0, fy = 0, fz = 0;
        let top = 0;
        stack[top++] = 0;
        while (top > 0) {
            const node = stack[--top];
            const m = mass[node];
            if (m === 0) continue;
            let dx = mx[node] - x, dy = my[node] - y, dz = mz[node] - z;
            let d2 = dx * dx + dy * dy + dz * dz;
            const leaf = inner[node] === 0;
            const size = half[node] * 2;
            if (leaf || (size * size) / d2 < THETA2) {
                if (leaf && body[node] === i && m === 1) continue;
                const self = leaf && body[node] === i ? 1 : 0;
                const weight = m - self;
                if (weight <= 0) continue;
                if (d2 < DIST_MIN2) {
                    // Coincident: push apart along a deterministic direction instead of dividing by zero.
                    dx = ((i * 7919) % 13) / 13 - 0.5 || 0.3;
                    dy = ((i * 104729) % 11) / 11 - 0.5 || -0.2;
                    dz = ((i * 1299709) % 7) / 7 - 0.5 || 0.1;
                    d2 = DIST_MIN2;
                }
                const w = (strength * weight) / d2;
                fx += dx * w;
                fy += dy * w;
                fz += dz * w;
                continue;
            }
            for (let s = 0; s < 8; s++) {
                const c = child[node * 8 + s];
                if (c >= 0 && top < stack.length) stack[top++] = c;
            }
        }
        velocity[i * 3] += fx;
        velocity[i * 3 + 1] += fy;
        velocity[i * 3 + 2] += fz;
    };

    const tick = (): number => {
        if (n === 0) {
            alpha = 0;
            return 0;
        }
        alpha += (0 - alpha) * ALPHA_DECAY;
        ticks++;

        // Springs.
        for (let l = 0; l < linkCount; l++) {
            const a = edges[l * 2], b = edges[l * 2 + 1];
            let dx = positions[b * 3] + velocity[b * 3] - positions[a * 3] - velocity[a * 3];
            let dy = positions[b * 3 + 1] + velocity[b * 3 + 1] - positions[a * 3 + 1] - velocity[a * 3 + 1];
            let dz = positions[b * 3 + 2] + velocity[b * 3 + 2] - positions[a * 3 + 2] - velocity[a * 3 + 2];
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-3;
            const pull = ((d - linkLength[l]) / d) * alpha * linkStrength[l];
            dx *= pull;
            dy *= pull;
            dz *= pull;
            const bias = linkBias[l];
            velocity[b * 3] -= dx * bias;
            velocity[b * 3 + 1] -= dy * bias;
            velocity[b * 3 + 2] -= dz * bias;
            velocity[a * 3] += dx * (1 - bias);
            velocity[a * 3 + 1] += dy * (1 - bias);
            velocity[a * 3 + 2] += dz * (1 - bias);
        }

        // Charge.
        build();
        const strength = CHARGE * alpha;
        for (let i = 0; i < n; i++) repel(i, strength);

        // Cohesion toward each community's own centre, and a weak pull toward the middle.
        centre.fill(0);
        members.fill(0);
        for (let i = 0; i < n; i++) {
            const c = community[i];
            if (c < 0) continue;
            centre[c * 3] += positions[i * 3];
            centre[c * 3 + 1] += positions[i * 3 + 1];
            centre[c * 3 + 2] += positions[i * 3 + 2];
            members[c]++;
        }
        for (let c = 0; c < k; c++) {
            const m = Math.max(1, members[c]);
            centre[c * 3] /= m;
            centre[c * 3 + 1] /= m;
            centre[c * 3 + 2] /= m;
        }
        const pull = COHESION * alpha;
        const gravity = GRAVITY * alpha;
        for (let i = 0; i < n; i++) {
            const c = community[i];
            if (c >= 0) {
                velocity[i * 3] += (centre[c * 3] - positions[i * 3]) * pull;
                velocity[i * 3 + 1] += (centre[c * 3 + 1] - positions[i * 3 + 1]) * pull;
                velocity[i * 3 + 2] += (centre[c * 3 + 2] - positions[i * 3 + 2]) * pull;
            }
            velocity[i * 3] -= positions[i * 3] * gravity;
            velocity[i * 3 + 1] -= positions[i * 3 + 1] * gravity;
            velocity[i * 3 + 2] -= positions[i * 3 + 2] * gravity;
        }

        // Integrate.
        for (let v = 0; v < n * 3; v++) {
            velocity[v] *= VELOCITY_KEEP;
            positions[v] += velocity[v];
        }
        return alpha;
    };

    return {
        positions,
        tick,
        get alpha() {
            return alpha;
        },
        get ticks() {
            return ticks;
        },
        settled: () => alpha < ALPHA_MIN,
    };
}
