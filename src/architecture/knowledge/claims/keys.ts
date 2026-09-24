/**
 * Claim/source key vocabulary (#148). Fixed here (extensible in code); a user-facing editor is
 * deferred. Mirrors `relations/vocabulary.ts`.
 */
export const CLAIM_KEYS = ["claim"] as const;
export const SOURCE_KEYS = ["source", "sources"] as const;

/**
 * A wager's two halves (#570): what you expect to see, and the day you expect to know by.
 *
 * Declared here, beside the claim and source keys, because this is the file every reader of a
 * note's vocabulary already imports — a fifth reader cannot invent a sixth spelling.
 */
export const EXPECTATION_KEYS = ["expect"] as const;
export const HORIZON_KEYS = ["by"] as const;

const CLAIM_SET: ReadonlySet<string> = new Set(CLAIM_KEYS);
const SOURCE_SET: ReadonlySet<string> = new Set(SOURCE_KEYS);

/** True for a claim key (`claim`). */
export function isClaimKey(value: string): boolean {
    return CLAIM_SET.has(value);
}

/** True for a source key (`source` / `sources`). */
export function isSourceKey(value: string): boolean {
    return SOURCE_SET.has(value);
}

/** True for a wager key (`expect` / `by`). */
export function isWagerKey(value: string): boolean {
    return (EXPECTATION_KEYS as readonly string[]).includes(value) || (HORIZON_KEYS as readonly string[]).includes(value);
}

/** True for any claim or source key — used to pick claim/source-bearing fields. */
export function isClaimOrSourceKey(value: string): boolean {
    return CLAIM_SET.has(value) || SOURCE_SET.has(value);
}

/**
 * What marks a judgement as being about a note's claim (#561, epic #558).
 *
 * The `GAP_SUBJECT_PREFIX` shape: the subject is a short, locale-free descriptor, never the text
 * that was stated. A claim is a sentence, and the sentence is exactly what the judgement record
 * must never hold — that is why the record is on by default (#336).
 */
export const CLAIM_SUBJECT_PREFIX = "claim:";

/** The judgement subject for a claim on this note. */
export function claimSubject(path: string): string {
    return `${CLAIM_SUBJECT_PREFIX}${path}`;
}
