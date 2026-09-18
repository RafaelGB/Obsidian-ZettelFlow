import type { KnowledgeModel } from "./KnowledgeModel";

/**
 * Compute once per revision (#458, epic #452).
 *
 * `KnowledgeModel.revision()` has existed since #302 and **nothing consumed it**. Every surface
 * called `getModel()` and recomputed its projection from scratch, over some five thousand lines of
 * analysis, whether or not a single note had changed — the `resolved` event fires far more often
 * than the graph actually moves.
 *
 * The budgets (#457) said how much that costs, and the answer was lopsided: most projections are
 * milliseconds, and **discovery is 1.5 seconds at ten thousand notes** — a hundred times heavier
 * than any other, re-run on every render. So the revision is the key, and this is the lock.
 *
 * The cache is deliberately dumb, because a clever cache is a source of wrong answers:
 *
 * - **Per model, and one revision at a time.** Cached against the model *instance* — a revision
 *   number alone is not an identity, and two freshly built models both sit at revision 1. The
 *   moment a model moves, everything derived from its previous revision is dropped, so there is
 *   no partial staleness to reason about. That is the property that makes this safe, not fast.
 * - **Keyed by the arguments too**, so a projection asked two different questions does not get one
 *   answer. An argument that cannot be serialised is **not memoised at all** rather than keyed
 *   wrongly — computing twice is cheap, answering the wrong question is not.
 * - **Bounded**, with least-recently-used eviction. A cache without a ceiling is a leak with good
 *   manners. The `WeakMap` means a model nobody holds takes its cache with it.
 * - **Failures are not answers.** A projection that threw is not remembered as having thrown.
 *
 * It only holds for projections that are pure functions of the model and their arguments. The
 * three it is applied to read nothing else — no clock, no settings, no vault — and a guardrail
 * test asserts that.
 */

/** The ceiling, per model. Small: the surfaces ask a handful of questions of the current model. */
export const MEMO_MAX_ENTRIES = 64;

interface ModelCache {
    revision: number;
    /** Insertion order is eviction order; re-reading moves an entry to the back. */
    entries: Map<string, unknown>;
}

const caches = new WeakMap<KnowledgeModel, ModelCache>();

/** A key, or `undefined` when the arguments cannot honestly be turned into one. */
function keyFor(name: string, args: unknown[]): string | undefined {
    if (args.length === 0) return name;
    // `JSON.stringify` quietly drops a function or a symbol, which would make two different
    // questions share one key. Rejected up front rather than serialised into a lie.
    for (const arg of args) {
        if (typeof arg === "function" || typeof arg === "symbol") return undefined;
        if (typeof arg === "object" && arg !== null && hasUnserialisable(arg)) return undefined;
    }
    try {
        const serialised = JSON.stringify(args);
        return serialised === undefined ? undefined : `${name}|${serialised}`;
    } catch {
        // A cycle, a BigInt: not keyable, so not cached.
        return undefined;
    }
}

/** Whether an options object hides something `JSON.stringify` would silently drop. */
function hasUnserialisable(value: object): boolean {
    for (const nested of Object.values(value)) {
        if (typeof nested === "function" || typeof nested === "symbol") return true;
    }
    return false;
}

/** This model's cache, emptied first if the model has moved since it was filled. */
function cacheFor(model: KnowledgeModel): ModelCache {
    const revision = model.revision();
    const existing = caches.get(model);
    if (existing && existing.revision === revision) return existing;
    const fresh: ModelCache = { revision, entries: new Map() };
    caches.set(model, fresh);
    return fresh;
}

/** Forget what is cached for one model — or, with no model, nothing, since each is independent. */
export function clearMemo(model?: KnowledgeModel): void {
    if (model) caches.delete(model);
}

/** What is cached for a model: for the tests, and for proving a projection ran once. */
export function memoStats(model: KnowledgeModel): { entries: number; revision: number } {
    const cache = caches.get(model);
    return cache && cache.revision === model.revision()
        ? { entries: cache.entries.size, revision: cache.revision }
        : { entries: 0, revision: model.revision() };
}

/**
 * Wrap a projection so it computes once per model revision, per set of arguments.
 *
 * The wrapped function keeps its signature exactly, so a caller never knows — which is the point:
 * this must be addable to a projection without any of its consumers changing.
 */
export function memoise<Args extends unknown[], Result>(
    name: string,
    projection: (model: KnowledgeModel, ...args: Args) => Result
): (model: KnowledgeModel, ...args: Args) => Result {
    return (model: KnowledgeModel, ...args: Args): Result => {
        const key = keyFor(name, args);
        if (key === undefined) return projection(model, ...args);

        const { entries } = cacheFor(model);
        if (entries.has(key)) {
            const hit = entries.get(key) as Result;
            // Re-insert, so the least *recently used* entry is the one eviction takes.
            entries.delete(key);
            entries.set(key, hit);
            return hit;
        }

        const result = projection(model, ...args);
        entries.set(key, result);
        if (entries.size > MEMO_MAX_ENTRIES) {
            for (const oldest of entries.keys()) {
                entries.delete(oldest);
                break; // insertion order is eviction order; one per insert is enough
            }
        }
        return result;
    };
}
