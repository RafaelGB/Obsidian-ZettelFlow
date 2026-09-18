/**
 * How long something took (#457, epic #452).
 *
 * Before this there was **one** `performance.now()` in the entire plugin and no budget anywhere in
 * the tests, which meant every performance statement about ZettelFlow — including the ones in the
 * epic that created this file — was an opinion. You cannot fix what you cannot measure, and you
 * cannot keep it fixed without a gate.
 *
 * So there is one instrument, and both the budgets in CI and the numbers shown to the user come
 * out of it. What you see in Health is literally what the build measured.
 *
 * It is deliberately tiny: a wrapper, a bounded ring of samples, and no I/O. Measuring must not
 * become a thing worth measuring.
 */

/**
 * The things worth timing. A union rather than a free string, so a budget and a surface cannot
 * silently disagree about a name — and so adding a measurement is a decision, not a typo.
 */
export type Measurable =
    | "index.build"
    | "index.cache.read"
    | "derive.one"
    | "enrich.full"
    | "enrich.incremental"
    | "analysis.heaviest"
    | "canvas.scan";

export interface Sample {
    name: Measurable;
    /** Milliseconds. */
    ms: number;
    /** Unix ms of when it finished. */
    at: number;
    /** What it was measured over — a note count, a file count — when the caller knows. */
    scale?: number;
    /** False when the work threw. A pass that died after eight seconds is worth keeping. */
    ok: boolean;
}

/**
 * The ring's size. Small on purpose: the surfaces want the *last* timing of each kind, and a
 * history nobody reads is a leak with good manners.
 */
export const MAX_SAMPLES = 64;

const ring: Sample[] = [];

/** `performance.now()` where it exists (Obsidian, modern Node), `Date.now()` where it does not. */
function now(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function record(name: Measurable, started: number, ok: boolean, scale?: number): void {
    ring.push({
        name,
        ms: now() - started,
        at: Date.now(),
        ok,
        ...(scale === undefined ? {} : { scale }),
    });
    if (ring.length > MAX_SAMPLES) ring.splice(0, ring.length - MAX_SAMPLES);
}

export interface MeasureOptions {
    /** How much work this was: notes derived, files read, canvases parsed. */
    scale?: number;
}

/** Time some work. Returns exactly what it returned, and rethrows exactly what it threw. */
export function measure<T>(name: Measurable, work: () => T, options: MeasureOptions = {}): T {
    const started = now();
    try {
        const result = work();
        record(name, started, true, options.scale);
        return result;
    } catch (error) {
        record(name, started, false, options.scale);
        throw error;
    }
}

/** The same, awaited — so what is timed is the work, not the creation of its promise. */
export async function measureAsync<T>(
    name: Measurable,
    work: () => Promise<T>,
    options: MeasureOptions = {}
): Promise<T> {
    const started = now();
    try {
        const result = await work();
        record(name, started, true, options.scale);
        return result;
    } catch (error) {
        record(name, started, false, options.scale);
        throw error;
    }
}

/** Everything still in the ring, oldest first. */
export function samples(): readonly Sample[] {
    return ring;
}

/** The most recent timing of one kind — what a surface shows and a budget asserts. */
export function lastSample(name: Measurable): Sample | undefined {
    for (let index = ring.length - 1; index >= 0; index--) {
        if (ring[index].name === name) return ring[index];
    }
    return undefined;
}

/** Empty it. A decision (between two measured runs), so it is stated rather than inlined. */
export function clearSamples(): void {
    ring.length = 0;
}
