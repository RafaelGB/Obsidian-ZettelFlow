/**
 * Work that takes a while, done honestly (#462, epic #452).
 *
 * Some passes are genuinely long: the first enrichment of a fifty-thousand-note vault, a rebuild,
 * a search across every canvas. Before this they ran with no statement that they were running, no
 * way to stop them, and — on the wrong day — a UI that stopped answering.
 *
 * The yielding was already there, inside `enrichInlineRelations`, as a bare
 * `if (n % 50 === 0) await Promise.resolve()`. This generalises it and adds the two things that
 * were missing: **progress**, and **a way to stop**.
 *
 * The property that makes cancelling safe is that each item is applied **whole or not at all**.
 * The pass hands one item at a time to `step`; when it stops, the items it finished are finished
 * and the rest were never started. There is no half-applied state to reason about, which is the
 * same rule the model-revision memo and the write record both live by.
 */

/** How many items between cooperative yields. Often enough that Obsidian stays responsive. */
export const DEFAULT_YIELD_EVERY = 50;

export interface LongPassProgress {
    done: number;
    total: number;
}

export interface LongPassOptions {
    yieldEvery?: number;
    /** Checked on every item; the pass stops at the next boundary. */
    signal?: { aborted: boolean };
    /** Called on each yield boundary, and once at the end. Never per item — that would cost more than the work. */
    onProgress?: (progress: LongPassProgress) => void;
}

export interface LongPassResult<T> {
    /** The items that completed. */
    done: T[];
    /** Items whose `step` threw. Counted, never allowed to stop the pass. */
    failed: number;
    cancelled: boolean;
}

/**
 * Run `step` over every item, yielding as it goes.
 *
 * An item that throws is counted and skipped: one unreadable note must not lose the other
 * forty-nine thousand. Cancelling returns what was finished, so the caller can record exactly
 * that and no more.
 */
export async function runLongPass<T>(
    items: readonly T[],
    step: (item: T) => Promise<void> | void,
    options: LongPassOptions = {}
): Promise<LongPassResult<T>> {
    const yieldEvery = options.yieldEvery ?? DEFAULT_YIELD_EVERY;
    const result: LongPassResult<T> = { done: [], failed: 0, cancelled: false };
    let seen = 0;

    for (const item of items) {
        if (options.signal?.aborted) {
            result.cancelled = true;
            break;
        }
        seen++;
        try {
            await step(item);
            result.done.push(item);
        } catch {
            result.failed++;
        }
        if (seen % yieldEvery === 0) {
            options.onProgress?.({ done: seen, total: items.length });
            await Promise.resolve();
        }
    }

    options.onProgress?.({ done: seen, total: items.length });
    return result;
}
