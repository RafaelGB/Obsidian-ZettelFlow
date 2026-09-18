/**
 * A search that says what it searched (#461, epic #452) — pure.
 *
 * The library manager's *find who uses it* (#448) reads **every canvas in the vault** with
 * `cachedRead`, on demand, with no bound and no way to stop it. At a few dozen canvases nobody
 * notices. At fifty thousand notes it is the one place in ZettelFlow that can genuinely hang while
 * you wait for a `Notice`.
 *
 * Two things fix that, and neither is a cache:
 *
 * - **A bound.** There is a limit, it has a default, and a caller cannot forget to pass one.
 * - **Honesty.** The result carries how much was covered and whether it stopped early, so the
 *   answer can say *"searched 214 canvases"* instead of implying it searched them all. A search
 *   that quietly truncates is worse than one that refuses: it produces a confident wrong answer.
 *
 * One unreadable item never loses the rest — it is counted and the scan continues.
 */

/** The default ceiling. High enough for any real vault's canvases, low enough to never hang. */
export const SCAN_LIMIT = 2_000;

/** How often to yield to the UI while scanning. */
const YIELD_EVERY = 25;

export interface ScanResult<T> {
    matches: T[];
    /** How many items were actually looked at. */
    scanned: number;
    /** True when the limit was reached before the set ran out. */
    stoppedEarly: boolean;
    /** True when the caller aborted it. */
    cancelled: boolean;
    /** How many items could not be read. Counted, never silently dropped. */
    failed: number;
}

export interface ScanOptions {
    limit?: number;
    signal?: { aborted: boolean };
}

/**
 * Look at each item until it matches, the limit is reached, or the caller says stop.
 *
 * Yields every {@link YIELD_EVERY} items, so a long search leaves Obsidian responsive rather than
 * holding the main thread for the duration.
 */
export async function boundedScan<T>(
    items: readonly T[],
    matches: (item: T) => Promise<boolean> | boolean,
    options: ScanOptions = {}
): Promise<ScanResult<T>> {
    const limit = options.limit ?? SCAN_LIMIT;
    const result: ScanResult<T> = {
        matches: [],
        scanned: 0,
        stoppedEarly: false,
        cancelled: false,
        failed: 0,
    };

    for (const item of items) {
        if (options.signal?.aborted) {
            result.cancelled = true;
            return result;
        }
        if (result.scanned >= limit) {
            result.stoppedEarly = true;
            return result;
        }
        result.scanned++;
        try {
            if (await matches(item)) result.matches.push(item);
        } catch {
            // One unreadable file must not lose the other forty-nine thousand.
            result.failed++;
        }
        if (result.scanned % YIELD_EVERY === 0) await Promise.resolve();
    }

    // An abort that landed on the very last item still means the answer is not complete.
    if (options.signal?.aborted) result.cancelled = true;
    return result;
}

/** What the result should say, as a locale key and the number it takes. */
export function describeScan<T>(result: ScanResult<T>): { key: string; count: number } {
    if (result.cancelled) return { key: "scan_cancelled", count: result.scanned };
    if (result.stoppedEarly) return { key: "scan_stopped_early", count: result.scanned };
    return { key: "scan_searched", count: result.scanned };
}
