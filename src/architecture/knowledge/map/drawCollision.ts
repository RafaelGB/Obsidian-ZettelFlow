import type { KnowledgeModel } from "../model/KnowledgeModel";
import { memoise } from "../model/memo";
import { buildKnowledgeMap } from "./knowledgeMap";
import { communitiesOf } from "./communities";
import { ruledOutCollisions } from "../judgement/collisionVerdict";
import type { Judgement } from "../judgement/Judgement";

/**
 * Two things nowhere near each other (#566, epic #559) — pure.
 *
 * Every pair-finder in this product looks for pairs that are **close**: `findDiscoveries` wants
 * shared graph context, and #529 named its output *gaps* — *where your thinking almost touches and
 * never does*. This is the complement, and the complement is not a harder search. It is a
 * **choice**, inside a space so large that searching it is the one thing that must not happen:
 * 4,371 pairs on the reference vault, ~48.7 M at ten thousand notes, 95 % of them collisions.
 *
 * So nothing is enumerated, ranked or cached. A pair is **drawn**, in two stages:
 *
 * 1. one note uniformly;
 * 2. the other **from the bucket that already satisfies the distance** — another community, or
 *    another region — so the constraint costs zero rejections and cannot false-negative. A vault
 *    with one community returns `null` in a couple of lookups instead of after two hundred futile
 *    spins.
 *
 * Only the three things a bucket cannot know reject: a shared neighbour, an existing link, and a
 * pair you have already ruled out. `findDiscoveries`, `gapTally` and `topGaps` are never called —
 * the heaviest projection in the product (#458) has no business inside a dice roll.
 *
 * It is **not memoised**, and that is deliberate: the answer depends on a seed, and a cache keyed
 * by seed is a list of pairs by another name.
 */

/** How far apart, as a fact about the graph — and the only difficulty dial this product may have. */
export type CollisionDistance = "far" | "very-far";

export interface Collision {
    a: string;
    b: string;
    distance: CollisionDistance;
}

export interface DrawCollisionOptions {
    /** *far* — different communities. *very-far* — different regions, or a note that stands alone. */
    distance?: CollisionDistance;
    /** The draw is deterministic given this. An argument, never a clock read in here. */
    seed: number;
    /** Fix one side, for *make a move → analogy* on the note you are reading (#569). */
    from?: string;
    /**
     * The judgement record (#568). The draw reads the ruled-out pairs out of it **itself**, so
     * building the filter and applying it live in one place — a verdict only one reader honoured
     * would put the pair back from another door and make the button look broken.
     */
    ruledOut?: readonly Judgement[];
}

/**
 * How many pairs may be rejected before the draw gives up.
 *
 * Only the shared-neighbour, link and ruled-out tests can reject — the distance never does — so on
 * any vault with something far enough apart, the first or second attempt succeeds. The ceiling is
 * there for the pathological shape (a small vault where everything distant is also linked), and to
 * make "it cannot spin" a fact rather than a hope.
 */
export const COLLISION_DRAW_ATTEMPTS = 200;

/** The one bucket every note that belongs to no community and no region shares. */
const ALONE = "\u0000alone";

interface Partition {
    paths: string[];
    /** Bucket per note at each distance — a community hub, a region hub, or `ALONE`. */
    community: Map<string, string>;
    region: Map<string, string>;
    /** Bucket → its members, so the second stage is a lookup rather than a filter. */
    byCommunity: Map<string, string[]>;
    byRegion: Map<string, string[]>;
    out: Map<string, Set<string>>;
    in: Map<string, Set<string>>;
}

/**
 * Where every note sits, from the two projections that already exist (#512 regions, #522
 * communities). Memoised per model revision like they are — this part *is* a pure function of the
 * model, and it is the only part that is.
 */
const partitionOf = memoise("collisionPartition", (model: KnowledgeModel): Partition => {
    const paths: string[] = [];
    const out = new Map<string, Set<string>>();
    const incoming = new Map<string, Set<string>>();

    for (const idea of model.all()) {
        paths.push(idea.path);
        if (!out.has(idea.path)) out.set(idea.path, new Set());
        if (!incoming.has(idea.path)) incoming.set(idea.path, new Set());
    }
    for (const idea of model.all()) {
        for (const relation of idea.relations) {
            if (!model.get(relation.to)) continue;
            out.get(idea.path)?.add(relation.to);
            incoming.get(relation.to)?.add(idea.path);
        }
    }
    paths.sort();

    const community = new Map<string, string>();
    for (const group of communitiesOf(model)) {
        for (const path of [group.hub, ...group.members]) community.set(path, group.hub);
    }
    const region = new Map<string, string>();
    for (const cluster of buildKnowledgeMap(model).clusters) {
        for (const path of [cluster.hub, ...cluster.members]) region.set(path, cluster.hub);
    }

    const byCommunity = new Map<string, string[]>();
    const byRegion = new Map<string, string[]>();
    for (const path of paths) {
        // A note in no community and no region stands **alone** — and this is the only reader in
        // the product for which that is prime material rather than a limitation (#529 said the
        // loneliest notes get nothing from the gap lens; here they are the point).
        const inCommunity = community.get(path) ?? ALONE;
        const inRegion = region.get(path) ?? ALONE;
        community.set(path, inCommunity);
        region.set(path, inRegion);
        const members = byCommunity.get(inCommunity) ?? [];
        members.push(path);
        byCommunity.set(inCommunity, members);
        const neighbours = byRegion.get(inRegion) ?? [];
        neighbours.push(path);
        byRegion.set(inRegion, neighbours);
    }

    return { paths, community, region, byCommunity, byRegion, out, in: incoming };
});

/** A small, fast, seeded PRNG. Deterministic across platforms, which `Math.random` is not. */
function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pick<T>(items: readonly T[], random: () => number): T | undefined {
    return items.length === 0 ? undefined : items[Math.floor(random() * items.length) % items.length];
}

/**
 * Whether these two already share something — **same direction only**, which is what
 * `candidatePairs` means by co-citation (two notes cited by the same third) and bibliographic
 * coupling (two notes citing the same third). Walks the smaller set.
 */
function sharesNeighbour(partition: Partition, a: string, b: string): boolean {
    const pairs: [Set<string>, Set<string>][] = [
        [partition.in.get(a) ?? new Set(), partition.in.get(b) ?? new Set()],
        [partition.out.get(a) ?? new Set(), partition.out.get(b) ?? new Set()],
    ];
    for (const [left, right] of pairs) {
        const [small, large] = left.size <= right.size ? [left, right] : [right, left];
        for (const shared of small) if (large.has(shared)) return true;
    }
    return false;
}

/** A link is not a shared neighbour, so a linked pair passes every other test. It is excluded here. */
function linked(partition: Partition, a: string, b: string): boolean {
    return (partition.out.get(a)?.has(b) ?? false) || (partition.out.get(b)?.has(a) ?? false);
}

/**
 * One pair, or nothing.
 *
 * `null` means *this vault has nothing far enough apart* — an empty or one-note model, a single
 * community asked for *far*, an anchor whose bucket is empty, or a shape where everything distant
 * is already linked. It never means *try again*.
 */
export function drawCollision(model: KnowledgeModel, options: DrawCollisionOptions): Collision | null {
    const distance = options.distance ?? "far";
    const partition = partitionOf(model);
    if (partition.paths.length < 2) return null;

    const buckets = distance === "far" ? partition.byCommunity : partition.byRegion;
    const bucketOf = distance === "far" ? partition.community : partition.region;
    const random = mulberry32(options.seed);
    const ruledOut = ruledOutCollisions(options.ruledOut ?? []);

    if (options.from !== undefined && !model.get(options.from)) return null;

    // The second stage draws a **bucket** and then a member of it, rather than a note out of the
    // whole vault. It is a bias — a lonely note is as likely as a crowded neighbourhood — and it is
    // the right one here: the pairs worth staging are the ones nothing else in the product can see.
    const names = [...buckets.keys()].filter((name) => distance !== "far" || name !== ALONE);

    for (let attempt = 0; attempt < COLLISION_DRAW_ATTEMPTS; attempt++) {
        const a = options.from ?? pick(partition.paths, random);
        if (a === undefined) return null;
        const home = bucketOf.get(a);

        // **Standing alone is not a neighbourhood.** Two notes that belong to nothing are not in
        // the same place — they are in no place, which is as far apart as this graph goes. So the
        // `ALONE` bucket is eligible against itself, and a vault of entirely isolated notes still
        // produces pairs (the epic's FR-5, and the reason `very-far` exists at all).
        //
        // `far` is the opposite: it asks for two *different communities*, and a note with no
        // community has none to differ from. It says nothing rather than pretending.
        if (distance === "far" && home === ALONE) return null;
        const elsewhere = names.filter((name) => name !== home || home === ALONE);
        if (elsewhere.length === 0) return null;

        const bucket = pick(elsewhere, random);
        const b = bucket === undefined ? undefined : pick(buckets.get(bucket) ?? [], random);
        if (b === undefined || a === b) continue;
        if (linked(partition, a, b)) continue;
        if (sharesNeighbour(partition, a, b)) continue;
        if (ruledOut.has(a, b)) continue;

        return a <= b ? { a, b, distance } : { a: b, b: a, distance };
    }
    return null;
}
