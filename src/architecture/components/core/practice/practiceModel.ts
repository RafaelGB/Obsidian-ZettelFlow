import {
    agencyReviewModel,
    buildHeatmapGrid,
    type AgencyReading,
    type DayCell,
    type Judgement,
    type JudgementVerdict,
} from "architecture/knowledge/state";

/**
 * **Practice** (#645, epic #639) — what you have been doing, as facts. Pure and locale-free: the
 * renderer turns these numbers into words. It composes two State functions it does not change:
 * the development journal's grid (#162) and the judgement record's review model (#389).
 *
 * Nothing here grades you (§XII). The agency index the review model also computes is deliberately
 * not carried: a percentage of you is a score, and the bar below says the same thing as counts.
 */

/** Twelve weeks: enough to see a rhythm, short enough that a new vault is not a sea of empty days. */
export const PRACTICE_WEEKS = 12;
/** The decisions shown. The full history of a note is its story in This note (#642). */
export const RECENT_LIMIT = 10;

export interface StripColumn {
    /** Seven consecutive days, oldest first. */
    cells: DayCell[];
    /** `YYYY-MM`, only on the column where the month changes (and the first). */
    month?: string;
}

export interface PracticeStrip {
    columns: StripColumn[];
    /** Ideas developed over the whole window. */
    total: number;
}

/** The days you developed ideas, over the last {@link PRACTICE_WEEKS} weeks ending `now`. */
export function practiceStrip(counts: Record<string, number>, now: number): PracticeStrip {
    const grid = buildHeatmapGrid(counts, now, PRACTICE_WEEKS);
    const columns: StripColumn[] = [];
    let lastMonth = "";
    for (let start = 0; start < grid.cells.length; start += 7) {
        const cells = grid.cells.slice(start, start + 7);
        const month = cells[0].date.slice(0, 7);
        columns.push(month === lastMonth ? { cells } : { cells, month });
        lastMonth = month;
    }
    return { columns, total: grid.total };
}

export type MixKind = "accepted" | "changed" | "rejected";

export interface PracticeMix {
    accepted: number;
    changed: number;
    rejected: number;
    /** The three above, summed — what the bar draws and the subtitle counts. */
    total: number;
    reading: AgencyReading;
    /** One per non-zero kind, in a fixed order, for the proportional bar. */
    segments: { kind: MixKind; count: number }[];
}

/**
 * How you answered proposals: accepted as they came, changed, or rejected — over every verdict
 * recorded. `null` when there is none yet, so the view says so instead of drawing an empty bar.
 * The reading keeps the review model's thresholds and sample minimum unchanged.
 */
export function practiceMix(history: readonly Judgement[]): PracticeMix | null {
    const { header } = agencyReviewModel(history);
    const counts: Record<MixKind, number> = {
        accepted: header.accepted,
        changed: header.modified,
        rejected: header.rejected,
    };
    const total = counts.accepted + counts.changed + counts.rejected;
    if (total === 0) return null;
    const order: MixKind[] = ["accepted", "changed", "rejected"];
    return {
        ...counts,
        total,
        reading: header.reading,
        segments: order.filter((kind) => counts[kind] > 0).map((kind) => ({ kind, count: counts[kind] })),
    };
}

export interface PracticeRecent {
    path: string;
    basename: string;
    verdict: JudgementVerdict;
    at: number;
}

/** The latest decisions, newest first. Who proposed and how sure you were stay in the record. */
export function practiceRecent(history: readonly Judgement[], limit = RECENT_LIMIT): PracticeRecent[] {
    return agencyReviewModel(history)
        .rows.slice(0, limit)
        .map((row) => ({ path: row.path, basename: row.basename, verdict: row.verdict, at: row.at }));
}
