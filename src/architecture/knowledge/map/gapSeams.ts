import type { KnowledgeModel } from "../model/KnowledgeModel";
import { gapTally } from "../discovery/discoveries";
import { communitiesOf } from "./communities";
import { memoise } from "../model/memo";

/**
 * Where two neighbourhoods almost touch (#531, epic #529): the gaps that cross between them, and
 * the links that already do.
 *
 * A **gap** is a pair of notes that share graph context and are not linked (#163). A **seam** is
 * what those pairs add up to over the community partition (#524): *these two neighbourhoods are
 * fourteen shared-context pairs apart and two links apart.* That is a sentence about a **place**,
 * which a list of pairs cannot be — and a place is something you can go and look at.
 */
export interface GapSeam {
    /** The two community indices into {@link communitiesOf}, lower first. */
    a: number;
    b: number;
    /** Their names, qualified only where two neighbourhoods would otherwise read the same. */
    labelA: string;
    labelB: string;
    /** How many gaps cross the seam. */
    gaps: number;
    /** The sum of their scores — how much shared context is not yet a link. */
    score: number;
    /** How many links already cross it (the bridges of #526). */
    links: number;
}

function basename(path: string): string {
    const file = path.split("/").pop() ?? path;
    return file.replace(/\.md$/i, "");
}

/** A note's folder, or `""` at the vault root. */
function parentOf(path: string): string {
    const cut = path.lastIndexOf("/");
    return cut < 0 ? "" : path.slice(0, cut);
}

/**
 * A neighbourhood's name, qualified when it would otherwise be ambiguous.
 *
 * A community is named after its most connected note (#514, #524), and names are not unique: the
 * reference vault has **two** communities whose hub is a `readme.md`, so a row reading
 * `readme ↔ readme` says nothing at all. The qualifier is the hub's **parent folder path**, not the
 * folder's name — `a/docs/readme.md` and `b/docs/readme.md` collide on both basename and folder
 * name, while a parent *path* is unique by construction, because two distinct paths sharing a
 * basename have distinct parents. Same instinct as the path-qualified wikilinks in the MOC renderer.
 */
function labelFor(hub: string, ambiguous: boolean): string {
    const name = basename(hub);
    if (!ambiguous) return name;
    const parent = parentOf(hub);
    return parent ? `${name} (${parent})` : name;
}

const byStr = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

interface Bucket {
    gaps: number;
    score: number;
    links: number;
}

/**
 * The **seams** of a model (#531): every pair of neighbourhoods with at least one gap crossing it.
 *
 * Three decisions, each measured rather than assumed (epic #529):
 *
 * - **Crossings only.** 152 of the reference vault's 217 gaps sit *inside* one community. A gap
 *   between two notes of the same neighbourhood is a local omission; the hole in the map is where
 *   two neighbourhoods barely touch, which is also where #522 put bridges and frontiers.
 * - **A gap never leaves its region.** 0 of 1.26 million gaps on a generated ten-thousand-note vault
 *   cross a region: shared context means a common neighbour, and a common neighbour means one
 *   connected component. That part *is* an invariant.
 *
 *   The endpoint test next to it **became** one. It used to be a guard: `KnowledgeModel` records a
 *   link's target whether or not it resolves, so two broken links from one note produced a candidate
 *   pair between two notes that do not exist, and a note that does not exist is in no community.
 *   Both measured vaults happened to contain no such pair — the generated one has no broken links —
 *   which is exactly why it read as an invariant when it was not. Since #538 the tally indexes only
 *   the model's own notes, so every endpoint reaching here has a community and the test cannot fire.
 *   It stays, because a projection reading a `Map` should say what it does with a miss, and because
 *   this comment is the only thing that would notice if that stopped being true.
 * - **Ordered gaps desc, then links asc, then labels.** The widest seam is the one with the most
 *   shared context and the fewest links already crossing, and that is explainable in one sentence.
 *   A ratio would be one step from an invented metric (§XI).
 *
 * Reads {@link gapTally} — the one shared candidate pass (#530) — so this walks the tally once and
 * the graph not at all: the link count reads each idea's own relations, never a neighbour set.
 * Deterministic, memoised per model revision, Obsidian-free; empty model ⇒ `[]`.
 */
export const gapSeams = memoise("gaps.seams", (model: KnowledgeModel): GapSeam[] => {
    const communities = communitiesOf(model);
    if (communities.length === 0) return [];

    const communityOf = new Map<string, number>();
    communities.forEach((community, index) => {
        for (const path of [community.hub, ...community.members]) communityOf.set(path, index);
    });

    // A numeric key, not a template string: at ten thousand notes the tally holds 1.26 million
    // pairs, and a string key per pair measures allocation rather than shape.
    const width = communities.length;
    const buckets = new Map<number, Bucket>();
    const bucketFor = (low: number, high: number): Bucket => {
        const key = low * width + high;
        let bucket = buckets.get(key);
        if (!bucket) {
            bucket = { gaps: 0, score: 0, links: 0 };
            buckets.set(key, bucket);
        }
        return bucket;
    };

    for (const gap of gapTally(model).candidates()) {
        const from = communityOf.get(gap.a);
        const to = communityOf.get(gap.b);
        // Since #538 both endpoints are notes in the model, so neither lookup can miss; the test
        // is kept because a silent `undefined` compared against a number would read as a match.
        if (from === undefined || to === undefined || from === to) continue;
        const bucket = bucketFor(Math.min(from, to), Math.max(from, to));
        bucket.gaps++;
        bucket.score += gap.score;
    }

    // The links that already cross, counted the way the bridge lens draws them (#526): one per
    // (target, type), so the legend and the graph can never disagree about what crosses here.
    for (const idea of model.all()) {
        const from = communityOf.get(idea.path);
        if (from === undefined) continue;
        const seen = new Set<string>();
        for (const relation of idea.relations) {
            const to = communityOf.get(relation.to);
            if (to === undefined || to === from) continue;
            const key = `${relation.to}|${relation.type}`;
            if (seen.has(key)) continue;
            seen.add(key);
            bucketFor(Math.min(from, to), Math.max(from, to)).links++;
        }
    }

    // Label only the neighbourhoods that appear, so a qualifier shows up exactly where it is needed.
    const appearing = new Set<number>();
    for (const [key, bucket] of buckets) {
        if (bucket.gaps === 0) continue; // a pair with links but no gap is not a seam
        appearing.add(Math.floor(key / width));
        appearing.add(key % width);
    }
    const nameCounts = new Map<string, number>();
    for (const index of appearing) {
        const name = basename(communities[index].hub);
        nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    }
    const labels = new Map<number, string>();
    for (const index of appearing) {
        const hub = communities[index].hub;
        labels.set(index, labelFor(hub, (nameCounts.get(basename(hub)) ?? 0) > 1));
    }

    const seams: GapSeam[] = [];
    for (const [key, bucket] of buckets) {
        if (bucket.gaps === 0) continue;
        const a = Math.floor(key / width);
        const b = key % width;
        seams.push({
            a,
            b,
            labelA: labels.get(a) as string,
            labelB: labels.get(b) as string,
            gaps: bucket.gaps,
            score: bucket.score,
            links: bucket.links,
        });
    }

    seams.sort(bySeamWidth);
    return seams;
});

/**
 * The one ordering a seam list comes in: **gaps desc, then links asc, then labels**. The widest seam
 * has the most shared context and the fewest links already crossing, and that is explainable in one
 * sentence — a ratio would be one step from an invented metric (§XI).
 *
 * Exported since #534 because subtracting the gaps you ruled out can change the ranking, and a
 * second copy of this comparator is how two surfaces come to disagree about which seam is widest.
 */
export function bySeamWidth(x: GapSeam, y: GapSeam): number {
    return y.gaps - x.gaps || x.links - y.links || byStr(x.labelA, y.labelA) || byStr(x.labelB, y.labelB);
}
