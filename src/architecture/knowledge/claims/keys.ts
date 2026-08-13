/**
 * Claim/source key vocabulary (#148). Fixed here (extensible in code); a user-facing editor is
 * deferred. Mirrors `relations/vocabulary.ts`.
 */
export const CLAIM_KEYS = ["claim"] as const;
export const SOURCE_KEYS = ["source", "sources"] as const;

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

/** True for any claim or source key — used to pick claim/source-bearing fields. */
export function isClaimOrSourceKey(value: string): boolean {
    return CLAIM_SET.has(value) || SOURCE_SET.has(value);
}
