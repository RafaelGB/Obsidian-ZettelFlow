import { CLAIM_KEYS } from "architecture/knowledge/claims/keys";

/**
 * Editing what a note claims (#561, epic #558) — pure.
 *
 * `ClaimSourceSchema` has parsed the `claim` field since #148, and every reader downstream of it —
 * the evolution timeline, the idea card, `CompareClaims`, `FindContradiction`, the evidence map —
 * has been starving ever since, because the only way to write one was to type YAML into a note by
 * hand. Measured on the reference vault: **0 of 94** notes in scope carry a claim.
 *
 * [§XIII](../../../docs/development/constitution.md) names that exact failure — *a capability whose
 * only authoring path is hand-edited YAML is not shippable, however well documented* — so this is
 * the mutation behind the gesture that fixes it. Obsidian-free, so the rules below are provable
 * without a vault:
 *
 * - **nothing moves.** The claim is set in place, so a note's properties keep their order.
 * - **nothing is lost.** A note that says several things keeps saying them; only the first is
 *   edited, because a claim set is compared order-insensitively (`recordSnapshot`) and index 0 is
 *   the only stable identity a claim has.
 * - **nothing happens for nothing.** A blank sentence is not a claim, and writes no key at all.
 */

/** The `claim` key, from the one vocabulary that owns it (#148). */
const CLAIM_KEY = CLAIM_KEYS[0];

/**
 * Which claim the door edits when a note says several things.
 *
 * The first, and it is not an arbitrary pick: snapshots compare claim **sets** order-insensitively
 * (`recordSnapshot.ts`), so *the one changed longest ago* is not derivable from anything stored.
 * Index 0 is the only identity that survives a reload.
 */
export const CLAIM_EDIT_INDEX = 0;

/**
 * What the note says, as the user wrote it.
 *
 * Deliberately **not** `ClaimSourceSchema.parse`: that synthesises a claim from a source-only note
 * (its basename) so the note enters the claims accounting. That is an accounting convenience, and
 * prefilling a sentence box with it would put words in someone's mouth.
 */
export function claimTextsOf(frontmatter?: Record<string, unknown>): string[] {
    const value = frontmatter?.[CLAIM_KEY];
    const texts: string[] = [];
    const take = (item: unknown): void => {
        if (typeof item !== "string") return;
        const text = item.trim();
        if (text.length > 0) texts.push(text);
    };
    if (Array.isArray(value)) value.forEach(take);
    else take(value);
    return texts;
}

/**
 * Put the sentence on the note. Returns whether anything was written — `false` for a blank
 * sentence, and then the frontmatter is untouched down to the key order.
 */
export function applyClaim(frontmatter: Record<string, unknown>, sentence: string): boolean {
    const text = sentence?.trim() ?? "";
    if (text.length === 0) return false;

    const current = frontmatter[CLAIM_KEY];
    if (Array.isArray(current)) {
        const next: unknown[] = [...(current as unknown[])];
        next[CLAIM_EDIT_INDEX] = text;
        frontmatter[CLAIM_KEY] = next;
        return true;
    }
    frontmatter[CLAIM_KEY] = text;
    return true;
}

/**
 * Take a claim off the note (#562) — the return's third answer.
 *
 * Returns whether anything was removed. It never leaves a husk: the last claim of a list takes the
 * key with it, because a `claim:` with nothing under it is a note that says something nobody can
 * read.
 *
 * The sentence itself is not this function's business. The caller has already put it somewhere it
 * survives — a rejected conclusion is part of your intellectual history.
 */
export function removeClaim(frontmatter: Record<string, unknown>, index: number): boolean {
    const current = frontmatter[CLAIM_KEY];
    if (Array.isArray(current)) {
        const texts: unknown[] = [...(current as unknown[])];
        if (index < 0 || index >= texts.length) return false;
        texts.splice(index, 1);
        if (texts.length === 0) delete frontmatter[CLAIM_KEY];
        else frontmatter[CLAIM_KEY] = texts;
        return true;
    }
    if (typeof current === "string" && index === CLAIM_EDIT_INDEX) {
        delete frontmatter[CLAIM_KEY];
        return true;
    }
    return false;
}
