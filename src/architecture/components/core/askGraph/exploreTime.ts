/**
 * **Time** (#697): your vault's growth as a strip of months, and a cursor that shows the graph as it
 * stood at any moment. Pure — the renderer draws the bars and moves the cursor.
 */

export interface TimeStrip {
    /** The first and last known creation times; `0` when no note says when it was made. */
    min: number;
    max: number;
    /** Notes made in each bin, oldest first. */
    bins: number[];
    /** Where each bin starts, in ms. */
    starts: number[];
}

/** At most this many bars: a strip, not a chart. */
export const TIME_BINS_MAX = 48;

/** How long playing the whole history takes. */
export const TIME_PLAY_MS = 9000;

const MONTH = 30.44 * 86_400_000;

/**
 * Bin the creation times: one bar a month, or wider bins when the history is longer than
 * {@link TIME_BINS_MAX} months. A note with no known time (`0`) is always there and is not counted.
 */
export function timeStrip(created: ArrayLike<number>): TimeStrip {
    let min = Infinity;
    let max = 0;
    for (let i = 0; i < created.length; i++) {
        const at = created[i];
        if (at <= 0) continue;
        if (at < min) min = at;
        if (at > max) max = at;
    }
    if (!Number.isFinite(min)) return { min: 0, max: 0, bins: [], starts: [] };
    const months = Math.max(1, Math.floor((max - min) / MONTH) + 1);
    const count = Math.min(TIME_BINS_MAX, months);
    const span = Math.max(1, max - min);
    const bins = Array.from({ length: count }, () => 0);
    const starts = Array.from({ length: count }, (_, i) => min + (span * i) / count);
    for (let i = 0; i < created.length; i++) {
        const at = created[i];
        if (at <= 0) continue;
        bins[Math.min(count - 1, Math.floor(((at - min) / span) * count))]++;
    }
    return { min, max, bins, starts };
}

/** The cursor at a fraction `u` of the strip: `1` is now (everything), which is `Infinity`. */
export function cursorAt(strip: TimeStrip, u: number): number {
    if (strip.max === 0 || u >= 1) return Infinity;
    return strip.min + Math.max(0, u) * (strip.max - strip.min);
}

/** Where a cursor sits on the strip, `0..1`. */
export function fractionOf(strip: TimeStrip, cursor: number): number {
    if (!Number.isFinite(cursor) || strip.max === strip.min) return 1;
    return Math.max(0, Math.min(1, (cursor - strip.min) / (strip.max - strip.min)));
}

/** How many notes are there at `cursor` (notes with no known time always are). */
export function presentAt(created: ArrayLike<number>, cursor: number): number {
    let count = 0;
    for (let i = 0; i < created.length; i++) if (created[i] <= 0 || created[i] <= cursor) count++;
    return count;
}
