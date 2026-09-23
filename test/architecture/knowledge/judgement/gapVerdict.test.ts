import { describe, it, expect, jest } from "@jest/globals";
import {
    GAP_SUBJECT_PREFIX,
    gapVerdict,
    openGapCount,
    openGaps,
    ruledOutGaps,
} from "architecture/knowledge/judgement/gapVerdict";
import { gapTally, topGaps } from "architecture/knowledge/discovery/discoveries";
import { gapSeams } from "architecture/knowledge/map/gapSeams";
import { openSeams } from "architecture/knowledge/judgement/gapVerdict";
import type { Idea } from "architecture/knowledge/model/Idea";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";
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

/**
 * **Subtraction after selection, never an argument** (#534, FR-2).
 *
 * The filter cannot be pushed into `gapTally`: `memoise` keys on stringified arguments and a `Set`
 * serialises to `{}`, so two different records would quietly share one cached tally. So the shared
 * pass stays argument-free and the verdicts are subtracted **after** it — which means asking for
 * five gaps with three ruled out has to over-fetch eight, or a verdict would silently shorten the
 * list it was meant to clean.
 */
describe("a ruled-out pair leaves every selection (#534, FR-2, AC-1)", () => {
    // One hub citing four notes co-cites six pairs, each score 2.
    const sixGaps = buildModel([
        idea("hub.md", "permanent", [{ to: "a.md" }, { to: "b.md" }, { to: "c.md" }, { to: "d.md" }]),
        idea("a.md", "permanent", []),
        idea("b.md", "permanent", []),
        idea("c.md", "permanent", []),
        idea("d.md", "permanent", []),
    ]);
    const ruling = (a: string, b: string, when = at): Judgement => ({ at: when, ...gapVerdict(a, b) });

    it("returns the gaps you have not ruled out, in the shipped order", () => {
        const all = topGaps(sixGaps, 6);
        const dropped = all[1];
        const open = openGaps(sixGaps, [ruling(dropped.a, dropped.b)], 6);
        expect(open).toEqual(all.filter((gap) => gap !== all[1]));
        expect(openGapCount(sixGaps, [ruling(dropped.a, dropped.b)])).toBe(5);
    });

    it("removes the same pair when the verdict was recorded the other way round", () => {
        const dropped = topGaps(sixGaps, 6)[0];
        const backwards = openGaps(sixGaps, [ruling(dropped.b, dropped.a)], 6);
        expect(backwards.some((gap) => gap.a === dropped.a && gap.b === dropped.b)).toBe(false);
        expect(backwards).toHaveLength(5);
    });

    it("still fills the list you asked for, because it over-fetches what you ruled out", () => {
        const all = topGaps(sixGaps, 6);
        const history = all.slice(0, 3).map((gap) => ruling(gap.a, gap.b));
        // Three of six ruled out and a limit of three: a naive filter-then-slice would return zero.
        expect(openGaps(sixGaps, history, 3)).toEqual(all.slice(3, 6));
    });

    it("gives exactly the unfiltered answer when nothing has been ruled out", () => {
        expect(openGaps(sixGaps, [], 5)).toEqual(topGaps(sixGaps, 5));
        expect(openGapCount(sixGaps, [])).toBe(gapTally(sixGaps).size);
    });

    it("does not subtract a pair twice when it has since been linked", () => {
        // b.md now links a.md, so the pair is no longer a gap at all -- and it is also ruled out.
        const linked = buildModel([
            idea("hub.md", "permanent", [{ to: "a.md" }, { to: "b.md" }, { to: "c.md" }, { to: "d.md" }]),
            idea("a.md", "permanent", []),
            idea("b.md", "permanent", [{ to: "a.md", type: "expands" }]),
            idea("c.md", "permanent", []),
            idea("d.md", "permanent", []),
        ]);
        const before = gapTally(linked).size;
        expect(openGapCount(linked, [ruling("a.md", "b.md")])).toBe(before);
    });

    it("counts without walking the tally, so the count costs what you ruled out", () => {
        // The O(ruled-out) proof: the count is the tally's own size minus the pairs still in it,
        // each looked up in O(1). A count that walked 1.26 million pairs per render would be a
        // different feature.
        const tally = gapTally(sixGaps);
        const spy = jest.spyOn(tally, "candidates");
        try {
            openGapCount(sixGaps, [ruling("a.md", "b.md")]);
            expect(spy).not.toHaveBeenCalled();
        } finally {
            spy.mockRestore();
        }
    });

    it("has nothing to select from an empty model", () => {
        const empty = buildModel([]);
        expect(openGaps(empty, [ruling("a.md", "b.md")], 5)).toEqual([]);
        expect(openGapCount(empty, [ruling("a.md", "b.md")])).toBe(0);
    });
});

/**
 * **The seam counts what you have not ruled out** (#534, FR-2, AC-8).
 *
 * A seam is what the gaps add up to over two neighbourhoods, so a verdict on a gap has to reach the
 * arithmetic that stands on it — otherwise the map would go on drawing a seam made entirely of pairs
 * you have already said are not related, which is the exact complaint this issue exists to answer.
 */
describe("the seam counts what you have not ruled out (#534, FR-2, AC-8)", () => {
    /** A clique of `size` notes, every one linked to every other — the #531 fixture. */
    const clique = (prefix: string, size: number): Idea[] =>
        Array.from({ length: size }, (_, n) =>
            idea(
                `${prefix}-${n}.md`,
                "permanent",
                Array.from({ length: size }, (_, m) => m)
                    .filter((m) => m > n)
                    .map((m) => ({ to: `${prefix}-${m}.md` }))
            )
        );

    // Two dense neighbourhoods joined by one link: three crossing gaps of score 2, one link.
    const twoCliques = buildModel(
        [...clique("x", 4), ...clique("y", 4)].map((entry) =>
            entry.path === "x-0.md"
                ? idea("x-0.md", "permanent", [
                      { to: "x-1.md" },
                      { to: "x-2.md" },
                      { to: "x-3.md" },
                      { to: "y-0.md" },
                  ])
                : entry
        )
    );
    const ruling = (a: string, b: string, when = at): Judgement => ({ at: when, ...gapVerdict(a, b) });

    it("drops the seam's gap count and score by the gap you ruled out", () => {
        expect(gapSeams(twoCliques)[0]).toEqual({
            a: 0,
            b: 1,
            labelA: "x-0",
            labelB: "y-0",
            gaps: 3,
            score: 6,
            links: 1,
        });
        const open = openSeams(twoCliques, [ruling("x-1.md", "y-0.md")]);
        expect(open).toHaveLength(1);
        expect(open[0]).toEqual({ a: 0, b: 1, labelA: "x-0", labelB: "y-0", gaps: 2, score: 4, links: 1 });
    });

    it("loses the seam entirely once every gap across it is ruled out", () => {
        const history = [
            ruling("x-1.md", "y-0.md"),
            ruling("x-2.md", "y-0.md"),
            ruling("x-3.md", "y-0.md"),
        ];
        expect(openSeams(twoCliques, history)).toEqual([]);
    });

    it("gives back the unfiltered seams, by identity, when nothing is ruled out", () => {
        // Identity, not equality: an empty record must not cost a copy of the memoised answer.
        expect(openSeams(twoCliques, [])).toBe(gapSeams(twoCliques));
    });

    it("leaves the tally unwalked and the memoised answer unmutated", () => {
        const tally = gapTally(twoCliques);
        const spy = jest.spyOn(tally, "candidates");
        try {
            openSeams(twoCliques, [ruling("x-1.md", "y-0.md")]);
            expect(spy).not.toHaveBeenCalled();
        } finally {
            spy.mockRestore();
        }
        // The projection is memoised: subtracting from the array it returned would corrupt every
        // later reader of the same revision.
        expect(gapSeams(twoCliques)[0].gaps).toBe(3);
    });

    it("comes back re-sorted when the subtraction changes the ranking", () => {
        // Three neighbourhoods: the x/y seam has 3 gaps, the x/z seam 2. Rule out two of the x/y
        // gaps and the ranking has to invert, or the widest seam would be the second row.
        const three = buildModel(
            [...clique("x", 4), ...clique("y", 4), ...clique("z", 4)].map((entry) =>
                entry.path === "x-0.md"
                    ? idea("x-0.md", "permanent", [
                          { to: "x-1.md" },
                          { to: "x-2.md" },
                          { to: "x-3.md" },
                          { to: "y-0.md" },
                      ])
                    : entry.path === "x-1.md"
                      ? idea("x-1.md", "permanent", [{ to: "x-2.md" }, { to: "x-3.md" }, { to: "z-0.md" }])
                      : entry
            )
        );
        const before = openSeams(three, []);
        expect(before.map((seam) => seam.gaps)).toEqual([...before.map((seam) => seam.gaps)].sort((p, q) => q - p));

        const widest = before[0];
        const after = openSeams(three, [ruling("x-2.md", "y-0.md"), ruling("x-3.md", "y-0.md")]);
        expect(after.map((seam) => seam.gaps)).toEqual([...after.map((seam) => seam.gaps)].sort((p, q) => q - p));
        expect(after[0]).not.toEqual(widest);
    });
});
