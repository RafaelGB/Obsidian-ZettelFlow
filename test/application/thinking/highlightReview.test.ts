import { describe, it, expect } from "@jest/globals";
import {
    REVIEW_INTERVALS_DAYS,
    afterReview,
    dueHighlights,
    isDueInFrontmatter,
    isReviewDue,
    reviewDueAt,
} from "application/thinking/highlightReview";
import { parseThought, renderThought, type Thought } from "application/thinking/thought";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 1);

function mark(id: string, at = T0, extra: Partial<Thought> = {}): Thought {
    return {
        id,
        at,
        text: "",
        links: [],
        about: "Notes/es.md",
        quote: { exact: "stores changes", prefix: "", suffix: "" },
        ...extra,
    };
}

describe("the review schedule is fixed and visible (#678)", () => {
    it("is five growing intervals", () => {
        expect(REVIEW_INTERVALS_DAYS).toEqual([3, 7, 21, 60, 180]);
    });

    it("brings a new highlight back a first interval after it was made", () => {
        expect(reviewDueAt(mark("a"))).toBe(T0 + 3 * DAY);
        expect(isReviewDue(mark("a"), T0 + 2 * DAY)).toBe(false);
        expect(isReviewDue(mark("a"), T0 + 3 * DAY)).toBe(true);
    });

    it("walks the intervals on each look, and repeats the last one", () => {
        let thought = mark("a");
        let now = T0 + 3 * DAY;
        const gaps: number[] = [];
        for (let i = 0; i < 6; i++) {
            thought = afterReview(thought, "kept", now);
            gaps.push((thought.review!.due - now) / DAY);
            now = thought.review!.due;
        }
        expect(gaps).toEqual([7, 21, 60, 180, 180, 180]);
    });

    it("treats changing your mind as a look too — the mark goes further out", () => {
        const next = afterReview(mark("a"), "changed", T0);
        expect(next.review).toEqual({ stage: 1, due: T0 + 7 * DAY, last: T0 });
    });

    it("never brings back what you let go", () => {
        const gone = afterReview(mark("a"), "let-go", T0 + 3 * DAY);
        expect(gone.review?.retired).toBe(true);
        expect(isReviewDue(gone, T0 + 10_000 * DAY)).toBe(false);
    });

    it("does not mutate the highlight it was given", () => {
        const original = mark("a");
        afterReview(original, "kept", T0);
        expect(original.review).toBeUndefined();
    });
});

describe("the few cards are chosen deterministically (#678)", () => {
    const now = T0 + 400 * DAY;

    it("deals only highlights — not thoughts, not set-aside ones", () => {
        const plain: Thought = { id: "p", at: T0, text: "a thought", links: [] };
        const aside = mark("s", T0, { incubated: { reason: "crystallized", at: T0 } });
        expect(dueHighlights([plain, aside, mark("h")], now).map((t) => t.id)).toEqual(["h"]);
    });

    it("longest-waiting first, then the oldest mark, then the id — and at most five", () => {
        const many = ["e", "d", "c", "b", "a", "f", "g"].map((id, i) => mark(id, T0 + (i % 3) * DAY));
        const first = dueHighlights(many, now).map((t) => t.id);
        expect(first).toHaveLength(5);
        expect(dueHighlights([...many].reverse(), now).map((t) => t.id)).toEqual(first);
        expect(first.slice(0, 3)).toEqual(["b", "e", "g"]);
    });

    it("leaves out what is not due yet", () => {
        const later = afterReview(mark("x"), "kept", now);
        expect(dueHighlights([later], now)).toEqual([]);
    });
});

describe("the review lives in the highlight's own file (#678)", () => {
    it("round-trips through the frontmatter", () => {
        const reviewed = afterReview(mark("a"), "kept", T0 + 3 * DAY);
        const back = parseThought(renderThought(reviewed), "Lab/a.md");
        expect(back.review).toEqual(reviewed.review);
        const gone = afterReview(mark("b"), "let-go", T0);
        expect(parseThought(renderThought(gone), "Lab/b.md").review?.retired).toBe(true);
    });

    it("writes nothing for a highlight never looked at, and reads a garbled review as none", () => {
        expect(renderThought(mark("a"))).not.toContain("review");
        const garbled = renderThought(mark("a")).replace("---\n\n", "  reviewStage: soon\n  reviewDue: x\n---\n\n");
        expect(parseThought(garbled, "Lab/a.md").review).toBeUndefined();
    });

    it("answers from the metadata cache the same way it answers from the file", () => {
        const now = T0 + 5 * DAY;
        const front = { id: "a", at: T0, about: "Notes/es.md", quoteExact: "stores changes" };
        expect(isDueInFrontmatter(front, now)).toBe(true);
        expect(isDueInFrontmatter({ ...front, reviewDue: now + DAY, reviewStage: 1 }, now)).toBe(false);
        expect(isDueInFrontmatter({ ...front, reviewRetired: true }, now)).toBe(false);
        expect(isDueInFrontmatter({ ...front, asideReason: "crystallized" }, now)).toBe(false);
        expect(isDueInFrontmatter({ id: "p", at: T0, about: "Notes/es.md" }, now)).toBe(false);
        expect(isDueInFrontmatter(undefined, now)).toBe(false);
    });
});
