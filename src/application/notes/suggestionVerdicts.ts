import type {
    Judgement,
    JudgementConfidence,
    JudgementVerdict,
} from "architecture/knowledge/judgement/Judgement";

/**
 * Verdicts on the wizard's connection suggestions (#411, epic #405) — the pure half.
 *
 * The companion pane ranks notes by shared tags and title words and offers them as *connection
 * suggestions*. That is **interpretive output from a heuristic**, and the constitution is explicit:
 * interpretive output — AI or heuristic — reaches the vault only through an explicit
 * accept / modify / reject, and the verdict is recorded. Until now accepting one wrote a link with
 * no verdict recorded and no way to reject, which also meant the surface where the user makes the
 * most decisions contributed **nothing** to the agency index it is measured by.
 *
 * The note does not exist while the wizard runs, so verdicts are **buffered** and flushed with the
 * created note's path. A session that never builds records nothing.
 *
 * Pure: no Obsidian, no store, no log.
 */

/** What the pane can record. `confirmed`/`challenged` belong to other surfaces. */
export type SuggestionVerdict = Extract<JudgementVerdict, "accepted" | "modified" | "rejected">;

export interface BufferedVerdict {
    /** Locale-free descriptor: what was judged, never the proposal's text. */
    subject: string;
    verdict: SuggestionVerdict;
    at: number;
    note?: string;
    confidence?: JudgementConfidence;
}

/** The subject prefix every wizard link verdict carries. */
export const SUGGESTION_SUBJECT_PREFIX = "suggest-link";

/**
 * A locale-free subject for a suggested link. The target's **path** identifies it; no label, no
 * excerpt, no reason text — the judgement record stays bounded and content-free by construction.
 */
export function suggestionSubject(targetPath: string): string {
    return `${SUGGESTION_SUBJECT_PREFIX}:${targetPath}`;
}

/** The target path a subject refers to, or `undefined` when it is not a suggestion subject. */
export function suggestionTarget(subject: string): string | undefined {
    const prefix = `${SUGGESTION_SUBJECT_PREFIX}:`;
    return subject.startsWith(prefix) ? subject.slice(prefix.length) : undefined;
}

/**
 * Record a verdict in the buffer. One verdict per suggestion: changing your mind replaces the
 * earlier one rather than recording both, so the agency breakdown counts decisions, not clicks.
 */
export function bufferVerdict(
    buffer: BufferedVerdict[],
    entry: BufferedVerdict
): BufferedVerdict[] {
    const others = buffer.filter((existing) => existing.subject !== entry.subject);
    return [...others, entry];
}

/** Forget a buffered verdict (the user undid it). */
export function dropVerdict(buffer: BufferedVerdict[], subject: string): BufferedVerdict[] {
    return buffer.filter((entry) => entry.subject !== subject);
}

/** Targets the user rejected: not re-proposed for the rest of the session. */
export function rejectedTargets(buffer: BufferedVerdict[]): string[] {
    return buffer
        .filter((entry) => entry.verdict === "rejected")
        .map((entry) => suggestionTarget(entry.subject))
        .filter((target): target is string => target !== undefined);
}

/**
 * Turn the buffer into judgements for the note that was finally created. Called only on a
 * successful build: a wizard closed without building records nothing.
 */
export function flushVerdicts(buffer: BufferedVerdict[], notePath: string): Judgement[] {
    if (!notePath) return [];
    return buffer.map((entry) => ({
        at: entry.at,
        path: notePath,
        subject: entry.subject,
        // A heuristic ranking, not a model and not the user's own idea.
        origin: "derived" as const,
        verdict: entry.verdict,
        ...(entry.note ? { note: entry.note } : {}),
        ...(entry.confidence ? { confidence: entry.confidence } : {}),
    }));
}
