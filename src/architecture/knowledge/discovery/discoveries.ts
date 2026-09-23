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
 * How large a `limit` selection stays cheaper than sorting.
 *
 * Bounded selection is O(pairs) comparisons plus O(limit) per accepted insert — a `splice` into an
 * array of *k* moves *k* elements — so it wins by a mile while the held set is small and loses badly
 * once it is not: with a limit at or past the size of the tally the reject test can never fire and
 * every candidate is spliced into an array growing to the full 1.26 million. Measured on generated
 * vaults, that is 18.6 s at three thousand notes against 0.3 s for collecting and sorting.
 *
 * So above this, the old path is the right one, and the caller that asked for a million rows pays
 * O(n log n) for them rather than O(n²). Every limit this product actually uses — 3 on the
 * recommendation, 5 on Home, 30 for the lens — is two orders of magnitude below it.
 */
export const SELECTION_MAX = 1_024;

/**
 * The strongest `limit` gaps (#530) — a **bounded linear pass** over {@link gapTally} for the limits
 * the product uses, and a plain sort for a limit big enough that selection would cost more.
 *
 * One comparison against the weakest gap held rejects a candidate outright; an accepted one is
 * placed by binary search and the overflow tail is dropped. That replaced building a
 * 1.24-million-element array and sorting it whole to answer a question about three: measured A/B in
 * one process on one warm tally at ten thousand notes, **1,393 ms of sorting became 553 ms of
 * selecting**, roughly three times faster on the step that changed.
 *
 * Past {@link SELECTION_MAX} it collects and sorts instead, because a `splice` into a large held set
 * is O(k) and selection turns quadratic (see the constant). A limit past the end of the tally
 * returns the whole tally, at the cost of the answer it asked for. Zero or less returns nothing.
 */
export const topGaps = memoise("gaps.top", (model: KnowledgeModel, limit: number): Discovery[] => {
    const cap = Math.max(0, Math.floor(limit));
    if (cap === 0) return [];

    if (cap > SELECTION_MAX) {
        const all = [...gapTally(model).candidates()];
        all.sort((x, y) => (outranks(x, y) ? -1 : 1));
        return all.slice(0, cap);
    }

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
 * The pair tally: every pair of notes sharing graph context, scored, **packed**.
 *
 * Keys are numeric — `low * width + high` over an index per path, the same trick
 * `map/gapSeams.ts` uses for its buckets — and the value is the score itself, since a co-citation
 * adds 2 and a coupling adds 1 and nothing ever needs them apart. That matters because this
 * structure is **retained** for as long as the model revision stands (it is what the readers share):
 * 1.26 million entries at ten thousand notes, where a `Map` of `{a, b, coCite, couple}` objects
 * under 1.26 million *string* keys was measured at **200 MB** retained. It also drops 1.26 million
 * string concatenations from the hot loop.
 *
 * Indices cover **the model's own ideas and nothing else** (#538). `KnowledgeModel` records a link's
 * target whether or not it resolves — deliberately, because that is what makes a degree honest — so
 * indexing every path it mentions meant two broken links in one note proposed a connection between
 * two notes that were never written. Here the index *is* the filter: a path with no note has no
 * index, so a pair touching it can never be keyed. Paths are **sorted** before they are indexed, so
 * index order is path order and the canonical `a < b` falls out of the key instead of costing a
 * string comparison per pair.
 */
interface PairTally {
    /** Pair key → score. */
    scores: Map<number, number>;
    /** Index → path. */
    paths: string[];
    /** Path → index, kept so one pair can be asked about without walking the tally (#534). */
    indexOf: Map<string, number>;
    /** The multiplier the key was built with. */
    width: number;
}

function candidatePairs(model: KnowledgeModel): PairTally {
    const ideas = model.all();

    // Every note **in the model**, sorted. Sorting once is what makes index order the same as path
    // order, so a key built with `low < high` is already canonical and reading a pair back out costs
    // no comparison -- there are 1.26 million of them at ten thousand notes. Targets that resolve to
    // no note are left out on purpose (#538): see `bump`.
    const paths = ideas.map((idea) => idea.path).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    const indexOf = new Map(paths.map((path, index) => [path, index]));

    const width = paths.length;
    const scores = new Map<number, number>();
    const bump = (x: string, y: string, weight: number): void => {
        if (x === y) return;
        const xi = indexOf.get(x);
        const yi = indexOf.get(y);
        // **This is the endpoints-exist rule** (#538), and it costs nothing: the adjacency holds
        // unresolved link targets too, and a target with no note got no index, so the miss that
        // reads like a defensive guard is what keeps a gap between two notes that do not exist out
        // of the tally. One `bump` rather than one filter per reader -- Home, the seams, the
        // dashboard count, the recommendation and the lens all stop seeing them at once.
        if (xi === undefined || yi === undefined) return;
        const key = xi < yi ? xi * width + yi : yi * width + xi;
        scores.set(key, (scores.get(key) ?? 0) + weight);
    };

    for (const idea of ideas) {
        const out = [...model.outNeighborSet(idea.path)];
        for (let i = 0; i < out.length; i++) {
            for (let j = i + 1; j < out.length; j++) bump(out[i], out[j], CO_CITATION_WEIGHT);
        }
        const incoming = [...model.inNeighborSet(idea.path)];
        for (let i = 0; i < incoming.length; i++) {
            for (let j = i + 1; j < incoming.length; j++) bump(incoming[i], incoming[j], COUPLING_WEIGHT);
        }
    }

    return { scores, paths, indexOf, width };
}

/**
 * Drop the candidates that are not gaps — an already-linked pair, either direction — **in place**.
 * Deleting from a `Map` while iterating it is well defined, so this needs no second structure, which
 * is the whole point: at ten thousand notes there are 1.26 million pairs and a copy of them is what
 * this design exists to avoid.
 *
 * There is no zero-score test: an entry exists only because something bumped it, and the smallest
 * bump is 1.
 */
function pruneToGaps(model: KnowledgeModel, tally: PairTally): void {
    // O(1) per test (#302) — no array allocation or linear scan per candidate pair.
    const isLinked = (a: string, b: string): boolean => model.hasEdge(a, b) || model.hasEdge(b, a);

    for (const key of tally.scores.keys()) {
        const a = tally.paths[Math.floor(key / tally.width)];
        const b = tally.paths[key % tally.width];
        if (isLinked(a, b)) tally.scores.delete(key);
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
    /**
     * This pair's score if it is a gap, `undefined` if it is not one — O(1), in either ordering
     * (#534).
     *
     * It exists so a reader can ask about the handful of pairs it cares about — the ones you ruled
     * out — without walking 1.26 million it does not. The `Map` still never escapes.
     */
    scoreOf(a: string, b: string): number | undefined;
}

/**
 * One tally, many readers (#530).
 *
 * `findDiscoveries` has always built the candidate map, sorted it whole, and returned the top three.
 * At ten thousand notes that is ~1.25 million pairs tallied, an array of all of them built, and a
 * full sort run — about 1.4 s on top of the tally — to answer a question about three of them. Worse,
 * `memoise` keys on the arguments (correctly: a projection asked two questions must not get one
 * answer), so a reader asking for five and a reader asking for sixty paid for the whole thing twice.
 *
 * So the expensive half takes **no arguments** and is memoised on its own: every reader in epic #529
 * — the list, the lens, the seams, the dashboard count — shares one pass.
 *
 * What that costs, stated rather than implied: the tally is **retained** for as long as the model
 * revision stands, where before it was garbage the moment the call returned. That is why it is
 * packed into numeric keys (see {@link candidatePairs}) — measured at **200 MB** retained for
 * 1.26 million pairs as objects under string keys, and budgeted as `memo.gaps.10k`.
 *
 * Nothing here takes a filter, a `Set` or the judgement history. `keyFor` in `memo.ts` stringifies its
 * arguments and a `Set` serialises to `{}`, so two different sets would quietly share one cache entry;
 * ruled-out pairs are subtracted after selection instead (#534).
 */
export const gapTally = memoise("gaps.tally", (model: KnowledgeModel): GapTally => {
    const tally = candidatePairs(model);
    pruneToGaps(model, tally);
    const { scores, paths, indexOf, width } = tally;
    return {
        size: scores.size,
        scoreOf(a: string, b: string): number | undefined {
            const ai = indexOf.get(a);
            const bi = indexOf.get(b);
            if (ai === undefined || bi === undefined || ai === bi) return undefined;
            return scores.get(ai < bi ? ai * width + bi : bi * width + ai);
        },
        *candidates(): Iterable<Discovery> {
            for (const [key, score] of scores) {
                // `a < b` holds by construction: the paths were sorted before they were indexed and
                // the key was built low-first, so no comparison is needed per pair.
                yield { a: paths[Math.floor(key / width)], b: paths[key % width], score };
            }
        },
    };
});
