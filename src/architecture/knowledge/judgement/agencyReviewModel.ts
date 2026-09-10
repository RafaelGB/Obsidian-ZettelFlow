import {
    agencyIndex,
    verdictBreakdown,
    INTERPRETIVE_ORIGINS,
} from "./judgementQueries";
import type { Judgement, JudgementConfidence, JudgementOrigin, JudgementVerdict } from "./Judgement";

/**
 * The **agency review** view model (#389, C6) — a pure composition of C5's metrics
 * ({@link agencyIndex}, {@link verdictBreakdown}) plus the log itself, ready for the Agency tab. All the
 * testable formatting lives here as **locale-free tokens**; the renderer only maps tokens → i18n and
 * builds DOM. Read-only and Obsidian-free: it describes the *gate*, never grades the person (§XII).
 */

/** A plain-language reading of your verdict mix — a description, never a score. */
export type AgencyReading = "deciding" | "mixed" | "accepting" | "unknown";

/** The compact header: the agency index + the interpretive accept/modify/reject counts + a reading. */
export interface AgencyReviewHeader {
    /** `shaped / interpretive` in [0,1], or `null` when there is nothing to describe. */
    index: number | null;
    /** Interpretive (AI/derived) verdicts the header describes. */
    interpretive: number;
    accepted: number;
    modified: number;
    rejected: number;
    /** A token the Experience layer maps to a one-line reading. */
    reading: AgencyReading;
}

/** One recorded decision, mapped for the list (locale-free — the renderer formats). */
export interface AgencyReviewRow {
    path: string;
    basename: string;
    subject: string;
    origin: JudgementOrigin;
    verdict: JudgementVerdict;
    confidence?: JudgementConfidence;
    note?: string;
    at: number;
}

export interface AgencyReviewModel {
    header: AgencyReviewHeader;
    /** Every recorded decision, **newest first**. */
    rows: AgencyReviewRow[];
}

/** Below this many interpretive verdicts, the reading is `unknown` — too little to read a pattern. */
export const AGENCY_READING_MIN_SAMPLE = 5;

function readingFor(index: number | null, interpretive: number): AgencyReading {
    if (index === null || interpretive < AGENCY_READING_MIN_SAMPLE) return "unknown";
    if (index >= 0.4) return "deciding";
    if (index >= 0.15) return "mixed";
    return "accepting";
}

function baseName(path: string): string {
    const file = path.split("/").pop() ?? path;
    return file.replace(/\.md$/i, "");
}

/**
 * Compose C5's metrics + the log into the Agency-tab view model (#389). Rows list **every** recorded
 * decision newest-first; the header describes only **interpretive** (AI/derived) output. Pure; an empty
 * log yields an empty list and an `unknown` reading — a friendly nothing, never a crash.
 */
export function agencyReviewModel(history: readonly Judgement[]): AgencyReviewModel {
    const idx = agencyIndex(history); // interpretive origins by default
    const breakdown = verdictBreakdown(history, { origins: INTERPRETIVE_ORIGINS });
    const header: AgencyReviewHeader = {
        index: idx.index,
        interpretive: idx.interpretive,
        accepted: breakdown.byVerdict.accepted,
        modified: breakdown.byVerdict.modified,
        rejected: breakdown.byVerdict.rejected,
        reading: readingFor(idx.index, idx.interpretive),
    };
    const rows: AgencyReviewRow[] = history
        .map((entry) => {
            const row: AgencyReviewRow = {
                path: entry.path,
                basename: baseName(entry.path),
                subject: entry.subject,
                origin: entry.origin,
                verdict: entry.verdict,
                at: entry.at,
            };
            if (entry.confidence) row.confidence = entry.confidence;
            if (entry.note) row.note = entry.note;
            return row;
        })
        .sort((a, b) => b.at - a.at); // newest first
    return { header, rows };
}
