import { toDayKey } from "architecture/knowledge/journal/heatmap";
import {
    JUDGEMENT_ORIGINS,
    JUDGEMENT_VERDICTS,
    type Judgement,
    type JudgementConfidence,
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
    /**
     * Whether any judgement on this idea carried a written rationale (#361, D1). A *reasoned* verdict is
     * a richer signal than a bare one — but its absence is still an unknown, never a mark against you.
     */
    hasRationale: boolean;
    /** The confidence attached to the **most recent** judgement, or `null` when it carried none (#361, D1). */
    lastConfidence: JudgementConfidence | null;
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
        hasRationale: false,
        lastConfidence: null,
    };

    for (const entry of history) {
        if (entry.path !== path) continue;
        signals.total++;
        signals.byVerdict[entry.verdict]++;
        signals.byOrigin[entry.origin]++;
        if (entry.note !== undefined) signals.hasRationale = true;
        if (signals.lastAt === null || entry.at > signals.lastAt) {
            signals.lastAt = entry.at;
            signals.lastConfidence = entry.confidence ?? null;
        }
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

// ── Agency metrics (#388, C5) ────────────────────────────────────────────────
// Local, vault-wide descriptions of your verdict mix. Never transmitted, never a score.

/**
 * The origins whose output is **interpretive** — a conclusion, a proposed connection — and so must pass
 * the §XII accept/modify/reject gate before it can reach a note. `human` output is your own and is not
 * gated, so it is excluded from the agency signal.
 */
export const INTERPRETIVE_ORIGINS: readonly JudgementOrigin[] = ["ai", "derived"];

/** Verdicts where you **shaped** the proposal (changed or refused it) instead of taking it as-is. */
const SHAPING_VERDICTS: readonly JudgementVerdict[] = ["modified", "rejected", "challenged"];

/** Options shared by the agency metrics. */
export interface AgencyMetricsOptions {
    /** Restrict the tally to these origins. Omitted = all origins (for {@link verdictBreakdown}). */
    origins?: readonly JudgementOrigin[];
}

/** A pure tally of the verdicts recorded, optionally scoped to certain origins (e.g. AI). */
export interface VerdictBreakdown {
    /** How many verdicts the tally covers. */
    total: number;
    /** Count per verdict — every verdict starts at 0, so a caller never reads `undefined`. */
    byVerdict: Record<JudgementVerdict, number>;
}

/**
 * The **AI accept/modify/reject rate** (#388) as raw counts, not a grade. With no `origins` it tallies
 * every verdict; pass `INTERPRETIVE_ORIGINS` for the AI/derived rate. Pure and vault-local; an empty log
 * yields a fully-zeroed shape, never `undefined`.
 */
export function verdictBreakdown(history: readonly Judgement[], opts: AgencyMetricsOptions = {}): VerdictBreakdown {
    const origins = opts.origins ? new Set<JudgementOrigin>(opts.origins) : null;
    const byVerdict = zeroed(JUDGEMENT_VERDICTS);
    let total = 0;
    for (const entry of history) {
        if (origins && !origins.has(entry.origin)) continue;
        byVerdict[entry.verdict]++;
        total++;
    }
    return { total, byVerdict };
}

/** The **cognitive agency signal** (#388) — a description of your engagement, never a score. */
export interface AgencyIndex {
    /** Interpretive (AI/derived) verdicts recorded. `0` ⇒ nothing to describe yet. */
    interpretive: number;
    /** Of those, how many you **shaped** — modified, rejected or challenged — rather than accepted as-is. */
    shaped: number;
    /**
     * `shaped / interpretive` in `[0, 1]`, or `null` when there is nothing to describe. This is a
     * **description of your verdict mix, never a score of you**: a low value can simply mean the
     * proposals were good, not that you were passive (§XI/§XII — a consequence of the log, not an
     * invented grade). The Experience layer must read it as *unknown* when `null`, not as zero.
     */
    index: number | null;
}

/**
 * How engaged you were with interpretive output (#388): of the AI/derived proposals you ruled on, the
 * share you shaped (modified/rejected/challenged) rather than accepted wholesale. Computed **only** from
 * the {@link Judgement} log — no new state, nothing transmitted. Deliberately **not** a user grade
 * (§XII); `index` is `null` when there is nothing to describe.
 */
export function agencyIndex(history: readonly Judgement[], opts: AgencyMetricsOptions = {}): AgencyIndex {
    const origins = new Set<JudgementOrigin>(opts.origins ?? INTERPRETIVE_ORIGINS);
    const shaping = new Set<JudgementVerdict>(SHAPING_VERDICTS);
    let interpretive = 0;
    let shaped = 0;
    for (const entry of history) {
        if (!origins.has(entry.origin)) continue;
        interpretive++;
        if (shaping.has(entry.verdict)) shaped++;
    }
    return { interpretive, shaped, index: interpretive === 0 ? null : shaped / interpretive };
}
