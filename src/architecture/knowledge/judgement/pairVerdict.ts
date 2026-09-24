import type { Judgement } from "./Judgement";

/**
 * A verdict about a **pair** of notes (#568) — the machinery #534 built for gaps, said once.
 *
 * Two features now record *these two notes are not related*: a gap you ruled out (#534) and a
 * collision you found nothing in (#568). They are different judgements about different objects, and
 * the shape underneath them is identical — canonicalise the pair so one pair has one entry
 * whichever way round it was seen, and read the record back into a set you can ask.
 *
 * Extracted rather than copied because the copy is where they would drift: a ruled-out set that
 * disagreed with the one Home reads would make a pair vanish from the front door for ever.
 */

/** The pairs you have ruled out: how many, whether one is among them, and a way to walk them. */
export interface RuledOutPairs {
    /** How many **pairs** (not entries) have been ruled out. */
    readonly size: number;
    /** Whether this pair has been ruled out, in either direction. */
    has(a: string, b: string): boolean;
    /** The pairs themselves, canonical `a < b`. */
    pairs(): Iterable<{ a: string; b: string }>;
}

/** The separator inside a pair key — a character no vault path can contain. */
const PAIR_SEPARATOR = "\u0000";

function pairKey(a: string, b: string): string {
    return a <= b ? `${a}${PAIR_SEPARATOR}${b}` : `${b}${PAIR_SEPARATOR}${a}`;
}

/**
 * One pair, canonicalised: the lower path becomes `path` and the higher rides in the subject.
 *
 * **Both paths never go in the subject.** `judgementQueries.forIdea` matches a path exactly, so a
 * two-path subject would belong to no note; `JudgementLog.record` scope-filters on `entry.path`, so
 * it would sail past the filter; and `|` — the obvious separator — is a legal filename character on
 * macOS and Linux, so it could not be parsed back.
 */
export function pairVerdict(prefix: string, a: string, b: string): Omit<Judgement, "at"> {
    const [low, high] = a <= b ? [a, b] : [b, a];
    return {
        path: low,
        subject: `${prefix}${high}`,
        origin: "derived",
        verdict: "rejected",
    };
}

/**
 * Read the ruled-out pairs of one kind out of the judgement record.
 *
 * An entry counts only when it carries this prefix **and** a `rejected` verdict with a non-blank
 * other path: every other entry — an AI proposal, a cultivation move, a promotion, a pair ruled on
 * some other way in a future version — is ignored rather than guessed at. Never throws, so a
 * hand-edited `data.json` degrades to *nothing is ruled out* instead of breaking a surface.
 */
export function ruledOutPairs(history: readonly Judgement[], prefix: string): RuledOutPairs {
    const keys = new Set<string>();
    for (const judgement of history) {
        if (judgement.verdict !== "rejected") continue;
        if (!judgement.subject.startsWith(prefix)) continue;
        const other = judgement.subject.slice(prefix.length).trim();
        const path = judgement.path.trim();
        if (!other || !path || other === path) continue;
        keys.add(pairKey(path, other));
    }
    return {
        size: keys.size,
        has: (a: string, b: string): boolean => a !== b && keys.has(pairKey(a, b)),
        *pairs(): Iterable<{ a: string; b: string }> {
            for (const key of keys) {
                const [a, b] = key.split(PAIR_SEPARATOR);
                yield { a, b };
            }
        },
    };
}
