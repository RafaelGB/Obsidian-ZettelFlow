import { EXPECTATION_KEYS, HORIZON_KEYS } from "architecture/knowledge/claims/keys";
import { horizonAt, toDateInput } from "architecture/knowledge/claims/wager";

/**
 * Writing a wager onto a note (#570, epic #560) — pure.
 *
 * Two optional fields beside the claim, in the note itself, because **a prediction you cannot open
 * with your own tools is not yours** — the same argument the thinking space makes for storing
 * thoughts as files. So this is the `sourceEdit` shape: a mutator that writes what it was given and
 * nothing else, and one that takes it back.
 */

/** What the door was given. Both halves, or it writes nothing. */
export interface WagerInput {
    expectation: string;
    /** The day, as typed — `YYYY-MM-DD` from a date control, or anything a person wrote by hand. */
    by: string;
}

/**
 * Put the expectation and the horizon on the note. Returns whether anything was written.
 *
 * **Both or neither.** An expectation with no date cannot be resolved and a date with no
 * expectation is a reminder, which is the one thing this epic refuses to become — so an incomplete
 * pair writes nothing at all rather than half a wager nobody can answer.
 */
export function applyWager(frontmatter: Record<string, unknown>, wager: WagerInput): boolean {
    const expectation = wager.expectation?.trim() ?? "";
    const at = horizonAt(wager.by);
    if (expectation.length === 0 || at === undefined) return false;

    frontmatter[EXPECTATION_KEYS[0]] = expectation;
    // Written back as the day, not as an instant: what you typed is what the note says.
    frontmatter[HORIZON_KEYS[0]] = toDateInput(at);
    return true;
}

/**
 * Take the wager off the note — both halves, and nothing else.
 *
 * Called when a wager resolves (#571) and when the claim it belongs to is withdrawn (#562): an
 * expectation about a claim you no longer hold is not a wager, it is litter.
 */
export function clearWager(frontmatter: Record<string, unknown>): boolean {
    let removed = false;
    for (const key of [...EXPECTATION_KEYS, ...HORIZON_KEYS]) {
        if (frontmatter[key] === undefined) continue;
        delete frontmatter[key];
        removed = true;
    }
    return removed;
}
