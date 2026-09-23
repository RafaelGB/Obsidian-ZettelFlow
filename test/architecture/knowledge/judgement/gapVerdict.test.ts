import { describe, it, expect } from "@jest/globals";
import {
    GAP_SUBJECT_PREFIX,
    gapVerdict,
    ruledOutGaps,
} from "architecture/knowledge/judgement/gapVerdict";
import type { Judgement } from "architecture/knowledge/judgement/Judgement";

/**
 * **A gap you have ruled on stops asking** (#534, epic #529).
 *
 * Gaps never converged: `findDiscoveries` has offered the same pairs on every render since #163,
 * because nothing recorded the one sentence that settles them — *these two are not related*. The
 * epic tried arithmetic twice and failed on purpose, with numbers: no graph statistic can tell a
 * filing convention from a thought, and a person can, in one click. Which is §XII exactly — the
 * machine observes, the human rules, and the verdict is data.
 *
 * Only *no* needs remembering. Linking two notes makes the pair stop being a gap by construction,
 * so there is no "accepted" verdict here and nothing writes a link for you.
 */
const at = 1_700_000_000_000;
const entry = (over: Partial<Judgement> = {}): Judgement => ({
    at,
    path: "a.md",
    subject: `${GAP_SUBJECT_PREFIX}b.md`,
    origin: "derived",
    verdict: "rejected",
    ...over,
});

describe("the verdict that says two notes are not related (#534, FR-1, FR-3, AC-5)", () => {
    it("carries a path, a subject, an origin and a verdict — and nothing else", () => {
        const verdict = gapVerdict("a.md", "b.md");
        expect(verdict).toEqual({
            path: "a.md",
            subject: "gap:b.md",
            origin: "derived",
            verdict: "rejected",
        });
        // No note content, no score, no text from either note: the record is on by default because
        // of what it does *not* hold (#336).
        expect(Object.keys(verdict).sort()).toEqual(["origin", "path", "subject", "verdict"]);
    });

    it("canonicalises the pair, so the two orderings record the same thing", () => {
        expect(gapVerdict("b.md", "a.md")).toEqual(gapVerdict("a.md", "b.md"));
    });

    it("reads back as a ruled-out pair, whichever way round you ask", () => {
        const ruled = ruledOutGaps([entry()]);
        expect(ruled.has("a.md", "b.md")).toBe(true);
        expect(ruled.has("b.md", "a.md")).toBe(true);
        expect(ruled.size).toBe(1);
    });

    it("counts pairs, not entries", () => {
        // The same pair ruled out twice (which the recorder prevents, but a hand-edited data.json
        // does not) is one pair.
        const ruled = ruledOutGaps([entry(), entry({ at: at + 5_000 })]);
        expect(ruled.size).toBe(1);
        expect([...ruled.pairs()]).toEqual([{ a: "a.md", b: "b.md" }]);
    });

    it("ignores every judgement that is not a gap being ruled out", () => {
        const ruled = ruledOutGaps([
            entry({ subject: "challenge-idea" }), // another kind of judgement entirely
            entry({ verdict: "accepted" }), // a gap, but not a no
            entry({ subject: GAP_SUBJECT_PREFIX }), // no other path
            entry({ subject: `${GAP_SUBJECT_PREFIX}   ` }), // blank other path
        ]);
        expect(ruled.size).toBe(0);
        expect(ruled.has("a.md", "b.md")).toBe(false);
    });

    it("has nothing to say about an empty record", () => {
        const ruled = ruledOutGaps([]);
        expect(ruled.size).toBe(0);
        expect(ruled.has("a.md", "b.md")).toBe(false);
        expect([...ruled.pairs()]).toEqual([]);
    });

    it("never matches a pair against itself", () => {
        expect(ruledOutGaps([entry({ subject: `${GAP_SUBJECT_PREFIX}a.md` })]).has("a.md", "a.md")).toBe(false);
    });
});
