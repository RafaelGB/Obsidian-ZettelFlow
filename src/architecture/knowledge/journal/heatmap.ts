/** One day in the heatmap grid (#162). */
export interface DayCell {
    /** UTC `YYYY-MM-DD`. */
    date: string;
    count: number;
    /** 0 (none) … 4 (most) intensity band, encoded as a CSS class by the view. */
    level: 0 | 1 | 2 | 3 | 4;
}

export interface HeatmapGrid {
    cells: DayCell[];
    total: number;
}

const DAY_MS = 86_400_000;
export const DEFAULT_WEEKS = 52;
/** Keep a little over a year of tallies so the 52-week grid always has a full window. */
export const KEEP_DAYS = 370;

/** UTC day key `YYYY-MM-DD` — timezone-independent so counts and tests are deterministic. */
export function toDayKey(ts: number): string {
    return new Date(ts).toISOString().slice(0, 10);
}

/** Intensity band for a day's development-event count: 0 · 1–2 · 3–5 · 6–9 · 10+. */
export function levelForCount(count: number): 0 | 1 | 2 | 3 | 4 {
    if (count <= 0) return 0;
    if (count <= 2) return 1;
    if (count <= 5) return 2;
    if (count <= 9) return 3;
    return 4;
}

/**
 * Pure heatmap grid (#162, FR-7). Returns the last `weeks·7` days ending at `now` (oldest first),
 * each with its count from `counts` and an intensity level, plus the window total. Deterministic
 * with an injected `now`; Obsidian-free. Days outside the window are ignored.
 */
export function buildHeatmapGrid(
    counts: Record<string, number>,
    now: number,
    weeks: number = DEFAULT_WEEKS
): HeatmapGrid {
    const days = weeks * 7;
    const cells: DayCell[] = [];
    let total = 0;
    for (let offset = days - 1; offset >= 0; offset--) {
        const date = toDayKey(now - offset * DAY_MS);
        const count = counts[date] ?? 0;
        total += count;
        cells.push({ date, count, level: levelForCount(count) });
    }
    return { cells, total };
}

/**
 * Pure prune (#162, D-a): return a fresh map keeping only day keys within the last `keepDays` days
 * of `now` (the boundary day is kept). Lexicographic compare on `YYYY-MM-DD` = chronological.
 */
export function pruneCounts(
    counts: Record<string, number>,
    now: number,
    keepDays: number = KEEP_DAYS
): Record<string, number> {
    const cutoff = toDayKey(now - (keepDays - 1) * DAY_MS);
    const pruned: Record<string, number> = {};
    for (const [date, count] of Object.entries(counts)) {
        if (date >= cutoff) pruned[date] = count;
    }
    return pruned;
}
