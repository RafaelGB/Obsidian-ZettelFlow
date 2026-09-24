import type { Judgement } from "./Judgement";
import { pairVerdict, ruledOutPairs, type RuledOutPairs } from "./pairVerdict";

/**
 * Nothing there is a finding (#568, epic #559).
 *
 * 95 % of the pairs in a vault are collisions, so the draw never runs out — and most of what it
 * draws is nothing at all. Two notes can be far apart because the thought connecting them is
 * waiting to be had, or because they are a meeting-notes file and a recipe. Only a human can tell
 * those apart, which is what §XII says and what #534 already built the machinery for: the same
 * pairs come back for ever because nothing records *these two are not related*.
 *
 * The shape is `gapVerdict`'s, extracted into `pairVerdict.ts` so the two cannot drift.
 */

/** What marks a judgement as being about a collision. The other note's path follows it. */
export const COLLISION_SUBJECT_PREFIX = "collision:";

/** The verdict recorded when you say there is nothing between these two. Writes nothing to the vault. */
export function collisionVerdict(a: string, b: string): Omit<Judgement, "at"> {
    return pairVerdict(COLLISION_SUBJECT_PREFIX, a, b);
}

/**
 * The pairs you have said there is nothing in.
 *
 * **The one filter.** `drawCollision` calls this itself rather than taking a pre-built set, so
 * building it and applying it live in the same place — a verdict only the panel honoured would be
 * worse than none, because the pair would be back from another door and the button would look
 * broken.
 */
export function ruledOutCollisions(history: readonly Judgement[]): RuledOutPairs {
    return ruledOutPairs(history, COLLISION_SUBJECT_PREFIX);
}
