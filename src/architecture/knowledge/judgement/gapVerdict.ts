import type { KnowledgeModel } from "../model/KnowledgeModel";
import { gapTally, topGaps, type Discovery } from "../discovery/discoveries";
import type { Judgement } from "./Judgement";

/**
 * **A gap you have ruled on stops asking** (#534, epic #529).
 *
 * Gaps never converged. `findDiscoveries` has offered the same pairs on every render since #163,
 * because nothing recorded the one sentence that settles them: *these two are not related*. The
 * measurement made it concrete — the strongest gaps in the reference vault were not ideas at all but
 * the vault's **scaffolding**, eight folder-index notes owning 15 of its 217 gaps. The epic tried to
 * fix that with arithmetic and failed twice, on purpose and with numbers: degree damping left the
 * ranking unchanged (the offenders are not hubs) and a score floor deleted the real headline seam
 * before it touched the noise.
 *
 * Which is the answer rather than the obstacle. **No graph statistic can tell a filing convention
 * from a thought. A person can, in one click** — §XII exactly: the machine observes, the human
 * rules, and the verdict is data.
 *
 * Only *no* is remembered. Linking two notes stops the pair being a gap **by construction** (the
 * tally excludes linked pairs), so there is no "accepted" verdict here and nothing in this module
 * writes a link, a property or a line of a note.
 *
 * Pure, Obsidian-free and **deliberately unmemoised**: `memo.ts` keys on stringified arguments, and
 * a history array of 500 entries is not a cache key — worse, the set built from it serialises to
 * `{}`, so two different records would quietly share one entry. The work is O(ruled-out pairs),
 * which is a handful.
 */

/** What marks a judgement as being about a gap. The other note's path follows it. */
export const GAP_SUBJECT_PREFIX = "gap:";

/** A judgement as this module produces it: the four descriptors, with `at` left to the recorder. */
export type GapVerdict = Omit<Judgement, "at">;

/**
 * The verdict recorded when you say two notes are **not related** (FR-1).
 *
 * The pair is **canonicalised** — the lower path becomes `path` and the higher becomes the subject —
 * so the two orderings of one pair record the same entry and a reader needs no second lookup
 * (FR-3). It carries no note content, no score and no text: the judgement record is on by default
 * because of what it does not hold (#336).
 */
export function gapVerdict(a: string, b: string): GapVerdict {
    const [low, high] = a <= b ? [a, b] : [b, a];
    return {
        path: low,
        subject: `${GAP_SUBJECT_PREFIX}${high}`,
        origin: "derived",
        verdict: "rejected",
    };
}

/** The pairs you have ruled out: how many, whether one is among them, and a way to walk them. */
export interface RuledOutGaps {
    /** How many **pairs** (not entries) have been ruled out. */
    readonly size: number;
    /** Whether this pair has been ruled out, in either direction (FR-3). */
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
 * Read the ruled-out pairs out of the judgement record (FR-3).
 *
 * A judgement counts only when it is a `gap:` subject **and** a `rejected` verdict with a non-blank
 * other path: every other entry in the record — an AI proposal, a cultivation move, a gap ruled on
 * some other way in a future version — is ignored rather than guessed at. Never throws, so a
 * hand-edited `data.json` degrades to *nothing is ruled out* instead of breaking Home.
 */
export function ruledOutGaps(history: readonly Judgement[]): RuledOutGaps {
    const keys = new Set<string>();
    for (const judgement of history) {
        if (judgement.verdict !== "rejected") continue;
        if (!judgement.subject.startsWith(GAP_SUBJECT_PREFIX)) continue;
        const other = judgement.subject.slice(GAP_SUBJECT_PREFIX.length).trim();
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

/**
 * The strongest `limit` gaps you have **not** ruled out (FR-2).
 *
 * The filter is applied *after* the selection, never as an argument to it: the shared tally is
 * memoised on the model alone (see the note above about a `Set` serialising to `{}`), and pushing a
 * record into it would make every reader pay for the pass again. So this over-fetches by exactly the
 * number of pairs ruled out and then slices — asking for five with three ruled out fetches eight,
 * because a naive filter-then-slice would hand back two and look like a shorter vault.
 *
 * Over-fetching cannot be skipped when nothing is ruled out either: with an empty record this is
 * `topGaps(model, limit)` and the same memo entry, so Home pays nothing for a feature it is not
 * using.
 */
export function openGaps(model: KnowledgeModel, history: readonly Judgement[], limit: number): Discovery[] {
    const ruled = ruledOutGaps(history);
    if (ruled.size === 0) return topGaps(model, limit);
    const cap = Math.max(0, Math.floor(limit));
    if (cap === 0) return [];
    const selected = topGaps(model, cap + ruled.size);
    const open: Discovery[] = [];
    for (const gap of selected) {
        if (ruled.has(gap.a, gap.b)) continue;
        open.push(gap);
        if (open.length === cap) break;
    }
    return open;
}

/**
 * How many gaps are still open (FR-2) — the number the dashboard metric reads.
 *
 * O(pairs you ruled out), not O(gaps): the tally's own size minus the ruled-out pairs **still in
 * it**, each asked about in O(1). "Still in it" is what stops a pair you ruled out and then linked
 * being subtracted twice — linking already removed it from the tally, and a count that subtracted it
 * again would drift below the truth by one per pair, silently, forever.
 */
export function openGapCount(model: KnowledgeModel, history: readonly Judgement[]): number {
    const ruled = ruledOutGaps(history);
    const tally = gapTally(model);
    if (ruled.size === 0) return tally.size;
    let subtract = 0;
    for (const pair of ruled.pairs()) {
        if (tally.scoreOf(pair.a, pair.b) !== undefined) subtract++;
    }
    return Math.max(0, tally.size - subtract);
}
