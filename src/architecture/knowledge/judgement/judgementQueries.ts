import { toDayKey } from "architecture/knowledge/journal/heatmap";
import {
    JUDGEMENT_ORIGINS,
    JUDGEMENT_VERDICTS,
    type Judgement,
    type JudgementOrigin,
    type JudgementVerdict,
} from "./Judgement";

/**
 * Read projections over the {@link Judgement} log (#336, FR-8) — the shapes S2/S3/S4 consume. Pure,
 * deterministic, Obsidian-free, never throwing.
 *
 * Note what is deliberately absent: **no score, no ratio, no grade**. An idea nobody has ruled on
 * reads as *zero activity with no last verdict* — a well-defined **unknown**, not a failing mark.
 * Turning these counts into a judgement about the *user* is not something this layer does, and #339
 * is bound by the same rule (§XI: metrics are consequences, not inventions).
 */

/** Every judgement about one idea, oldest first. Exact path match — never a prefix. */
export function judgementsFor(history: readonly Judgement[], path: string): Judgement[] {
    return history.filter((entry) => entry.path === path);
}

/** The most recent judgement about one idea, or `null` when it has never been ruled on. */
export function lastJudgementFor(history: readonly Judgement[], path: string): Judgement | null {
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].path === path) return history[i];
    }
    return null;
}

/** What the log says about one idea. Counts only — the reading is the caller's. */
export interface AgencySignals {
    path: string;
    /** How many verdicts have been given on this idea. `0` means *unknown*, not *bad*. */
    total: number;
    /** Every verdict starts at 0, so a caller never reads `undefined`. */
    byVerdict: Record<JudgementVerdict, number>;
    /** Every origin starts at 0, for the same reason. */
    byOrigin: Record<JudgementOrigin, number>;
    /** When the idea was last ruled on, or `null` if never. */
    lastAt: number | null;
}

function zeroed<K extends string>(keys: readonly K[]): Record<K, number> {
    const out = {} as Record<K, number>;
    for (const key of keys) out[key] = 0;
    return out;
}

/**
 * The agency signals for one idea (#336). An empty log yields a complete, zeroed shape — the
 * "this idea has grown but you have not ruled on it" case is `total === 0`, which the Experience layer
 * renders as *unknown*, never as a zero score.
 */
export function agencySignals(history: readonly Judgement[], path: string): AgencySignals {
    const signals: AgencySignals = {
        path,
        total: 0,
        byVerdict: zeroed(JUDGEMENT_VERDICTS),
        byOrigin: zeroed(JUDGEMENT_ORIGINS),
        lastAt: null,
    };

    for (const entry of history) {
        if (entry.path !== path) continue;
        signals.total++;
        signals.byVerdict[entry.verdict]++;
        signals.byOrigin[entry.origin]++;
        if (signals.lastAt === null || entry.at > signals.lastAt) signals.lastAt = entry.at;
    }
    return signals;
}

/**
 * Judgements per UTC day, vault-wide (#336) — the tally #339 reframes the development streak onto, so
 * a streak counts days you *ruled on something* rather than days something happened. Uses the journal's
 * own {@link toDayKey}, so the two definitions of "a day" cannot drift apart.
 */
export function judgementDays(history: readonly Judgement[]): Record<string, number> {
    const days: Record<string, number> = {};
    for (const entry of history) {
        const key = toDayKey(entry.at);
        days[key] = (days[key] ?? 0) + 1;
    }
    return days;
}
