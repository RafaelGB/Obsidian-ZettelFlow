import type { KnowledgeModel } from "../model/KnowledgeModel";
import { memoise } from "../model/memo";

/** An unexpected connection: a pair of unlinked notes that share graph context (#163, `a < b`). */
export interface Discovery {
    a: string;
    b: string;
    score: number;
}

export interface FindDiscoveriesOptions {
    /** How many discoveries to surface (default 3 — "three surprising connections"). */
    limit?: number;
}

const DEFAULT_LIMIT = 3;
const CO_CITATION_WEIGHT = 2;
const COUPLING_WEIGHT = 1;

/** Shared-context score, mirroring #154 find-related: co-citation weighted above bibliographic coupling. */
export function pairScore(coCitation: number, coupling: number): number {
    return CO_CITATION_WEIGHT * coCitation + COUPLING_WEIGHT * coupling;
}

interface Tally {
    a: string;
    b: string;
    coCite: number;
    couple: number;
}

/**
 * Pure "morning discovery" engine (#163). Surfaces the top unlinked note pairs that share graph
 * context — notes co-cited by a common source (co-citation) or pointing at a common target
 * (bibliographic coupling) but not yet linked. Candidate pairs are generated once per node (every
 * pair within a node's out-neighbours is co-cited; every pair within its in-neighbours is coupled),
 * so only pairs with shared context are considered. Excludes already-linked pairs (edge either
 * direction) and zero-score pairs; canonical `a < b`; ordered score desc, then a asc, then b asc;
 * capped to `limit`. Deterministic, read-only, never throws; empty/edgeless model ⇒ `[]`.
 *
 * Memoised per model revision (#458): this was the heaviest projection ZettelFlow computes — 1.5 s
 * over ten thousand notes, a hundred times any other — and every surface re-ran it on render.
 * Applied here rather than at the State barrel so deep importers (Home, the dashboard) get it too.
 *
 * Since #530 the work itself lives one layer down, in {@link gapTally} and {@link topGaps}: this is
 * the same answer, bound to the default limit, and every other reader of a gap shares that one pass.
 * The signature, the ordering and the output are unchanged — it is public through `zf.knowledge`,
 * and a pinned expectation in `gapTally.test.ts` is what says so.
 */
export const findDiscoveries = memoise(
    "discoveries",
    (model: KnowledgeModel, opts: FindDiscoveriesOptions = {}): Discovery[] =>
        topGaps(model, opts.limit !== undefined && opts.limit > 0 ? Math.floor(opts.limit) : DEFAULT_LIMIT)
);

/**
 * The order the answer has always come in: score desc, then `a` asc, then `b` asc. As a predicate
 * rather than a comparator, because this is used to place one candidate among a handful, never to
 * sort a tally.
 */
function outranks(candidate: Discovery, held: Discovery): boolean {
    if (candidate.score !== held.score) return candidate.score > held.score;
    if (candidate.a !== held.a) return candidate.a < held.a;
    return candidate.b < held.b;
}

/**
 * The strongest `limit` gaps (#530) — a **bounded linear pass** over {@link gapTally}, never a sort
 * of it.
 *
 * One comparison against the weakest gap held rejects a candidate outright; an accepted one is
 * placed by binary search and the overflow tail is dropped. So the cost is O(pairs) comparisons plus
 * O(limit) per accepted insert, where a full sort of 1.26 million pairs was 2.8 s of it — to answer
 * a question about three.
 *
 * A limit past the end of the tally returns the whole tally: a caller asking for a million pairs
 * gets the cost of the answer it asked for, which is stated rather than capped. A limit of zero or
 * less returns nothing.
 */
export const topGaps = memoise("gaps.top", (model: KnowledgeModel, limit: number): Discovery[] => {
    const cap = Math.max(0, Math.floor(limit));
    if (cap === 0) return [];

    const best: Discovery[] = [];
    for (const candidate of gapTally(model).candidates()) {
        if (best.length === cap && !outranks(candidate, best[best.length - 1])) continue;
        let low = 0;
        let high = best.length;
        while (low < high) {
            const middle = (low + high) >> 1;
            if (outranks(candidate, best[middle])) high = middle;
            else low = middle + 1;
        }
        best.splice(low, 0, candidate);
        if (best.length > cap) best.pop();
    }
    return best;
});

/**
 * Every pair of notes that shares graph context, before anything is excluded: each pair within a
 * note’s out-neighbours is co-cited, each pair within its in-neighbours is coupled. One walk of the
 * model, and the only walk any of this does.
 */
function candidatePairs(model: KnowledgeModel): Map<string, Tally> {
    const tallies = new Map<string, Tally>();

    const bump = (x: string, y: string, kind: "coCite" | "couple"): void => {
        if (x === y) return;
        const [a, b] = x < y ? [x, y] : [y, x];
        const key = `${a} ${b}`;
        let tally = tallies.get(key);
        if (!tally) {
            tally = { a, b, coCite: 0, couple: 0 };
            tallies.set(key, tally);
        }
        tally[kind]++;
    };

    for (const idea of model.all()) {
        const out = [...model.outNeighborSet(idea.path)];
        for (let i = 0; i < out.length; i++) {
            for (let j = i + 1; j < out.length; j++) bump(out[i], out[j], "coCite");
        }
        const incoming = [...model.inNeighborSet(idea.path)];
        for (let i = 0; i < incoming.length; i++) {
            for (let j = i + 1; j < incoming.length; j++) bump(incoming[i], incoming[j], "couple");
        }
    }

    return tallies;
}

/**
 * Drop the candidates that are not gaps — an already-linked pair (either direction) and a pair that
 * scores zero — **in place**. Deleting from a `Map` while iterating it is well defined, so this needs
 * no second structure, which is the whole point: at ten thousand notes the candidate set is 1.26
 * million pairs, and a copy of it is what this design exists to avoid.
 */
function pruneToGaps(model: KnowledgeModel, tallies: Map<string, Tally>): void {
    // O(1) per test (#302) — no array allocation or linear scan per candidate pair.
    const isLinked = (a: string, b: string): boolean => model.hasEdge(a, b) || model.hasEdge(b, a);

    for (const [key, tally] of tallies) {
        if (isLinked(tally.a, tally.b) || pairScore(tally.coCite, tally.couple) <= 0) tallies.delete(key);
    }
}

/**
 * The gaps of a model: how many there are, and a way to walk them. The **shared pass** every reader
 * of a gap stands on (#530, epic #529).
 *
 * `size` counts **gaps**, not candidates — pairs that survived the already-linked exclusion and score
 * above zero. That is the number the epic measured (217 on the reference vault, 1,264,125 over a
 * generated ten thousand), and reading it as the raw candidate count is the one way to implement a
 * wrong metric here.
 *
 * `candidates()` is a **generator**: it yields fresh `{a, b, score}` objects and never hands out the
 * tally itself, so a reader can walk 1.26 million pairs without any of them being copied into an
 * array. Nothing about the order is promised — ordering is what the selector is for.
 */
export interface GapTally {
    readonly size: number;
    candidates(): Iterable<Discovery>;
}

/**
 * One tally, many readers (#530).
 *
 * `findDiscoveries` has always built the candidate map, sorted it whole, and returned the top three.
 * At ten thousand notes that is 1.26 million pairs tallied, a 1.26-million-element array built and a
 * full sort run — 2.8 s — to answer a question about three of them. Worse, `memoise` keys on the
 * arguments (correctly: a projection asked two questions must not get one answer), so a reader asking
 * for five and a reader asking for sixty paid for the whole thing twice.
 *
 * So the expensive half takes **no arguments** and is memoised on its own: every reader in epic #529
 * — the list, the lens, the seams, the dashboard count — shares one pass. Peak memory is strictly
 * below what it replaced: the map, pruned, and no array beside it.
 *
 * Nothing here takes a filter, a `Set` or the judgement history. `keyFor` in `memo.ts` stringifies its
 * arguments and a `Set` serialises to `{}`, so two different sets would quietly share one cache entry;
 * ruled-out pairs are subtracted after selection instead (#534).
 */
export const gapTally = memoise("gaps.tally", (model: KnowledgeModel): GapTally => {
    const tallies = candidatePairs(model);
    pruneToGaps(model, tallies);
    return {
        size: tallies.size,
        *candidates(): Iterable<Discovery> {
            for (const tally of tallies.values()) {
                yield { a: tally.a, b: tally.b, score: pairScore(tally.coCite, tally.couple) };
            }
        },
    };
});
