/**
 * Looking again at what you marked (#678, epic #674) — pure.
 *
 * A highlight is a judgement made while reading: *this mattered*. The review brings a few of them
 * back, on a fixed and visible schedule, and asks the only question worth asking of a past
 * judgement — do you still think so?
 *
 * The schedule is deliberately **not** adaptive. Five growing intervals, the last one repeating;
 * nothing learns how well you "remembered", because this is not memorisation and there is no
 * score to keep. The same highlights on the same day give the same cards, and a day you skip
 * changes nothing: a card that waits looks exactly the same tomorrow, and nothing piles up into a
 * number you are behind on.
 */

import { isHighlight, type Thought, type ThoughtReview } from "./thought";

/** The intervals, in days. Fixed, growing, and the last one repeats for as long as you keep it. */
export const REVIEW_INTERVALS_DAYS: readonly number[] = [3, 7, 21, 60, 180];

/** How many cards a look brings at most. A few things, never a queue. */
export const REVIEW_LIMIT = 5;

const DAY_MS = 86_400_000;

/** What you can say about a highlight you are shown again. */
export type ReviewVerdict =
    /** *Still think so* — it goes further out. */
    | "kept"
    /** *Changed my mind* — you wrote what you think now; the mark goes further out too. */
    | "changed"
    /** *Let it go* — it never comes back. The thought stays where it is. */
    | "let-go";

/** When a highlight comes back. One that was never reviewed is due a first interval after it was made. */
export function reviewDueAt(thought: Pick<Thought, "at" | "review">): number {
    return thought.review?.due ?? thought.at + REVIEW_INTERVALS_DAYS[0] * DAY_MS;
}

/** Whether this thought is a highlight waiting to be looked at again. */
export function isReviewDue(thought: Thought, now: number): boolean {
    if (!isHighlight(thought) || thought.review?.retired || thought.incubated) return false;
    return reviewDueAt(thought) <= now;
}

/**
 * The few highlights to look at now: the longest-waiting first, then the oldest mark, then the id —
 * a total order, so the same vault on the same day always deals the same cards.
 */
export function dueHighlights(thoughts: readonly Thought[], now: number, limit = REVIEW_LIMIT): Thought[] {
    return thoughts
        .filter((thought) => isReviewDue(thought, now))
        .sort((a, b) => reviewDueAt(a) - reviewDueAt(b) || a.at - b.at || a.id.localeCompare(b.id))
        .slice(0, Math.max(0, limit));
}

/** The highlight after your verdict. Never mutates; the caller writes it back. */
export function afterReview(thought: Thought, verdict: ReviewVerdict, now: number): Thought {
    const current = thought.review?.stage ?? 0;
    if (verdict === "let-go") {
        const review: ThoughtReview = { stage: current, due: reviewDueAt(thought), last: now, retired: true };
        return { ...thought, review };
    }
    const stage = Math.min(current + 1, REVIEW_INTERVALS_DAYS.length - 1);
    return { ...thought, review: { stage, due: now + REVIEW_INTERVALS_DAYS[stage] * DAY_MS, last: now } };
}

/**
 * The same question answered from a thought's frontmatter as Obsidian's cache has it — so a door
 * can know whether anything is due **without opening a single file**. YAML gives numbers and
 * booleans back typed; anything else is read as nothing.
 */
export function isDueInFrontmatter(front: Record<string, unknown> | undefined, now: number): boolean {
    if (!front) return false;
    const exact = front["quoteExact"];
    const about = front["about"];
    if (typeof exact !== "string" || !exact || typeof about !== "string" || !about) return false;
    // Ink carries the words it was written beside, but is never reviewed as a highlight (#745 E6).
    if (front["inkDrawing"]) return false;
    if (front["reviewRetired"] === true || front["reviewRetired"] === "true") return false;
    if (typeof front["asideReason"] === "string" && front["asideReason"]) return false;
    const due = Number(front["reviewDue"]);
    if (Number.isFinite(due) && front["reviewDue"] !== undefined && front["reviewDue"] !== null) return due <= now;
    const at = Number(front["at"]);
    return Number.isFinite(at) && at + REVIEW_INTERVALS_DAYS[0] * DAY_MS <= now;
}
