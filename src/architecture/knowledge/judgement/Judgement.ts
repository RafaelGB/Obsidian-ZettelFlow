/**
 * The **judgement record** (#336, epic #335) — the data that makes *cognitive agency* a consequence of
 * the model instead of an invented score.
 *
 * `timeline/recordSnapshot.ts` records **what** changed about an idea; nothing recorded **why**. Without
 * that, the system can say *"this note reached `permanent` and gained 4 sources"* but never *"...and you
 * never once ruled on it"*. A judgement is the missing half: a human decision, stored as data.
 *
 * What it stores is deliberately thin — a path, a short locale-free `subject`, an `origin` and a
 * `verdict`. **Never note content, never model output.** That is what lets it be on by default, next to
 * the evolution timeline, which is opt-in precisely because it stores claim texts.
 *
 * Pure, offline and Obsidian-free: the scope filter and persistence live in the runtime owner
 * (`architecture/plugin/judgement/JudgementLog`).
 */

/** Where the thing being judged came from. */
export const JUDGEMENT_ORIGINS = ["ai", "derived", "human"] as const;
export type JudgementOrigin = (typeof JUDGEMENT_ORIGINS)[number];

/** What the user decided. Locale-free — the i18n layer maps these to text. */
export const JUDGEMENT_VERDICTS = ["accepted", "modified", "rejected", "confirmed", "challenged"] as const;
export type JudgementVerdict = (typeof JUDGEMENT_VERDICTS)[number];

/** One recorded human decision about one idea. */
export interface Judgement {
    /** When the verdict was given. */
    at: number;
    /** The note the decision was about (vault path — the model's identity). */
    path: string;
    /**
     * A **short, locale-free descriptor** of what was judged: an action id (`challenge-idea`), a
     * cultivation move (`connect`), a relation (`supports:ideas/atomicity.md`). Never the proposed text,
     * so the log stays bounded and carries no content.
     */
    subject: string;
    origin: JudgementOrigin;
    verdict: JudgementVerdict;
    /** Optional short user remark. Omitted when blank. */
    note?: string;
}

/** Keep at most this many judgements (drop oldest on overflow), like every other persisted list. */
export const DEFAULT_MAX_JUDGEMENTS = 500;

const ORIGINS = new Set<string>(JUDGEMENT_ORIGINS);
const VERDICTS = new Set<string>(JUDGEMENT_VERDICTS);

/** Whether an unknown value is a well-formed {@link Judgement}. Never throws. */
export function isJudgement(value: unknown): value is Judgement {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Partial<Judgement>;
    return (
        typeof candidate.at === "number" &&
        Number.isFinite(candidate.at) &&
        typeof candidate.path === "string" &&
        candidate.path.trim().length > 0 &&
        typeof candidate.subject === "string" &&
        candidate.subject.trim().length > 0 &&
        typeof candidate.origin === "string" &&
        ORIGINS.has(candidate.origin) &&
        typeof candidate.verdict === "string" &&
        VERDICTS.has(candidate.verdict) &&
        (candidate.note === undefined || typeof candidate.note === "string")
    );
}

/** Normalise a valid entry: trim the descriptors, drop a blank note. */
function normalize(entry: Judgement): Judgement {
    const note = entry.note?.trim();
    const clean: Judgement = {
        at: entry.at,
        path: entry.path.trim(),
        subject: entry.subject.trim(),
        origin: entry.origin,
        verdict: entry.verdict,
    };
    if (note) clean.note = note;
    return clean;
}

function sameEntry(a: Judgement, b: Judgement): boolean {
    return (
        a.at === b.at &&
        a.path === b.path &&
        a.subject === b.subject &&
        a.origin === b.origin &&
        a.verdict === b.verdict
    );
}

/**
 * Pure, immutable recorder (#336, FR-6), mirroring {@link recordSnapshot}: appends `entry` to `history`
 * and returns a **new** array, or returns the **same reference** when there is nothing to record — a
 * malformed entry (blank path/subject, an origin or verdict outside its closed union) or an exact repeat
 * of the last entry, so recording twice is idempotent.
 *
 * Bounded to `maxLen` (default {@link DEFAULT_MAX_JUDGEMENTS}), dropping the oldest. Never mutates
 * `history`, never throws.
 */
export function recordJudgement(
    history: Judgement[],
    entry: Judgement,
    opts: { maxLen?: number } = {}
): Judgement[] {
    if (!isJudgement(entry)) return history;

    const clean = normalize(entry);
    const last = history[history.length - 1];
    if (last && sameEntry(last, clean)) return history;

    const maxLen = opts.maxLen ?? DEFAULT_MAX_JUDGEMENTS;
    const next = [...history, clean];
    return next.length > maxLen ? next.slice(next.length - maxLen) : next;
}

/**
 * Turn a possibly-corrupt persisted blob into a clean log (#336, AC-5): a missing, `null` or
 * non-array value yields `[]`, and broken members are dropped rather than throwing. This is what
 * makes a hand-edited or partially-written `data.json` degrade instead of breaking the plugin.
 */
export function sanitizeJudgementLog(raw: unknown): Judgement[] {
    if (!Array.isArray(raw)) return [];
    const out: Judgement[] = [];
    for (const value of raw) {
        try {
            if (isJudgement(value)) out.push(normalize(value));
        } catch {
            // A hostile member (a getter that throws, a Symbol) is simply skipped.
        }
    }
    return out;
}
