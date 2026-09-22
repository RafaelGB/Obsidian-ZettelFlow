import { describe, it, expect } from "@jest/globals";
import { findDiscoveries, gapTally, topGaps, SELECTION_MAX } from "architecture/knowledge/discovery/discoveries";
import { memoStats } from "architecture/knowledge/model/memo";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

/**
 * The net under #530 (epic #529), written before anything moved.
 *
 * `findDiscoveries` is public through `zf.knowledge`, so the refactor from *tally, sort, take three*
 * to *one shared tally, bounded selection* has to come out **byte-identical**. The way to know that
 * is a pinned expectation captured from the implementation as it was, not an assertion derived from
 * the same code it is checking.
 *
 * The fixture is built so the six designed pairs have six distinct scores
 * (`2 × co-citation + 1 × coupling`):
 *
 * | pair | evidence | score |
 * |---|---|---|
 * | `a1`/`a2` | three hubs cite both | 6 |
 * | `b1`/`b2` | two hubs cite both, and both link `t1` | 5 |
 * | `c1`/`c2` | two hubs cite both | 4 |
 * | `d1`/`d2` | one hub cites both, and both link `t2` | 3 |
 * | `e1`/`e2` | one hub cites both | 2 |
 * | `f1`/`f2` | both link `t3` | 1 |
 *
 * The hubs then pair up **with each other** by bibliographic coupling — two hubs citing the same
 * pair share two targets, which is a gap of score 2. Those five by-products are in the expectation
 * on purpose: they are what the current implementation returns, and a fixture that pretended
 * otherwise would be pinning a fiction.
 */
const ideas = [
    idea("hub/h1.md", "permanent", [{ to: "pair/a1.md" }, { to: "pair/a2.md" }]),
    idea("hub/h2.md", "permanent", [{ to: "pair/a1.md" }, { to: "pair/a2.md" }]),
    idea("hub/h3.md", "permanent", [{ to: "pair/a1.md" }, { to: "pair/a2.md" }]),
    idea("hub/h4.md", "permanent", [{ to: "pair/b1.md" }, { to: "pair/b2.md" }]),
    idea("hub/h5.md", "permanent", [{ to: "pair/b1.md" }, { to: "pair/b2.md" }]),
    idea("hub/h6.md", "permanent", [{ to: "pair/c1.md" }, { to: "pair/c2.md" }]),
    idea("hub/h7.md", "permanent", [{ to: "pair/c1.md" }, { to: "pair/c2.md" }]),
    idea("hub/h8.md", "permanent", [{ to: "pair/d1.md" }, { to: "pair/d2.md" }]),
    idea("hub/h9.md", "permanent", [{ to: "pair/e1.md" }, { to: "pair/e2.md" }]),
    idea("pair/a1.md", "permanent", []),
    idea("pair/a2.md", "permanent", []),
    idea("pair/b1.md", "permanent", [{ to: "shared/t1.md" }]),
    idea("pair/b2.md", "permanent", [{ to: "shared/t1.md" }]),
    idea("pair/c1.md", "permanent", []),
    idea("pair/c2.md", "permanent", []),
    idea("pair/d1.md", "permanent", [{ to: "shared/t2.md" }]),
    idea("pair/d2.md", "permanent", [{ to: "shared/t2.md" }]),
    idea("pair/e1.md", "permanent", []),
    idea("pair/e2.md", "permanent", []),
    idea("pair/f1.md", "permanent", [{ to: "shared/t3.md" }]),
    idea("pair/f2.md", "permanent", [{ to: "shared/t3.md" }]),
    idea("shared/t1.md", "permanent", []),
    idea("shared/t2.md", "permanent", []),
    idea("shared/t3.md", "permanent", []),
];
const model = buildModel(ideas);

/** Score desc, then a asc, then b asc — the order the answer has always come in. */
const byRank = (x: { a: string; b: string; score: number }, y: { a: string; b: string; score: number }): number =>
    y.score - x.score || (x.a < y.a ? -1 : x.a > y.a ? 1 : 0) || (x.b < y.b ? -1 : x.b > y.b ? 1 : 0);

/** Every gap in the fixture, in that order. */
const EXPECTED_GAPS = [
    { a: "pair/a1.md", b: "pair/a2.md", score: 6 },
    { a: "pair/b1.md", b: "pair/b2.md", score: 5 },
    { a: "pair/c1.md", b: "pair/c2.md", score: 4 },
    { a: "pair/d1.md", b: "pair/d2.md", score: 3 },
    { a: "hub/h1.md", b: "hub/h2.md", score: 2 },
    { a: "hub/h1.md", b: "hub/h3.md", score: 2 },
    { a: "hub/h2.md", b: "hub/h3.md", score: 2 },
    { a: "hub/h4.md", b: "hub/h5.md", score: 2 },
    { a: "hub/h6.md", b: "hub/h7.md", score: 2 },
    { a: "pair/e1.md", b: "pair/e2.md", score: 2 },
    { a: "pair/f1.md", b: "pair/f2.md", score: 1 },
];

describe("the gap answer, pinned before the refactor (#530, AC-1, AC-6)", () => {
    it("returns every gap in score-desc, a-asc, b-asc order", () => {
        expect(findDiscoveries(model, { limit: 1000 })).toEqual(EXPECTED_GAPS);
    });

    it("takes the strongest three by default", () => {
        expect(findDiscoveries(model)).toEqual(EXPECTED_GAPS.slice(0, 3));
    });

    it("gives the same answer twice", () => {
        expect(findDiscoveries(model, { limit: 1000 })).toEqual(findDiscoveries(model, { limit: 1000 }));
    });

    it("has nothing to say about an empty or edgeless model", () => {
        expect(findDiscoveries(buildModel([]), { limit: 10 })).toEqual([]);
        expect(
            findDiscoveries(buildModel([idea("a.md", "permanent", []), idea("b.md", "permanent", [])]), { limit: 10 })
        ).toEqual([]);
    });
});

describe("gapTally — one shared pass (#530, FR-1, FR-4, AC-6)", () => {
    it("counts the gaps, not the candidates it started from", () => {
        // The candidate map holds every pair sharing context, including the linked ones; `size` is
        // what survives the exclusion and scores above zero. That is the number the epic measured
        // (217 on the reference vault) and the number the dashboard metric needs.
        expect(gapTally(model).size).toBe(EXPECTED_GAPS.length);
    });

    it("walks exactly the gaps the answer is selected from", () => {
        expect([...gapTally(model).candidates()].sort(byRank)).toEqual(EXPECTED_GAPS);
    });

    it("is one memo entry, computed once per revision", () => {
        const fresh = buildModel(ideas);
        expect(memoStats(fresh).entries).toBe(0);
        const first = gapTally(fresh);
        expect(memoStats(fresh).entries).toBe(1);
        expect(gapTally(fresh)).toBe(first);
        expect(memoStats(fresh).entries).toBe(1);
    });

    it("has nothing to walk on an empty model", () => {
        const empty = gapTally(buildModel([]));
        expect(empty.size).toBe(0);
        expect([...empty.candidates()]).toEqual([]);
    });
});

describe("topGaps -- selection, not sorting (#530, FR-2, AC-4)", () => {
    it("takes the strongest N, in the answer’s order", () => {
        expect(topGaps(model, 6)).toEqual(EXPECTED_GAPS.slice(0, 6));
        expect(topGaps(model, 1)).toEqual(EXPECTED_GAPS.slice(0, 1));
    });

    it("hands back the whole tally when asked for more than there is", () => {
        expect(topGaps(model, EXPECTED_GAPS.length + 50)).toEqual(EXPECTED_GAPS);
    });

    it("has nothing to give for a limit of none", () => {
        expect(topGaps(model, 0)).toEqual([]);
        expect(topGaps(model, -3)).toEqual([]);
    });

    it("never sorts the candidates for a limit the product uses", () => {
        // The point of the change: at ten thousand notes the tally is 1.26 million pairs, and
        // sorting it to answer a question about three of them cost 2.8 s. What is forbidden is
        // sorting the *candidates* -- the tally itself sorts its path index once, which is how
        // `a < b` comes out of the key for free, and that is not what this guards.
        const fresh = buildModel(ideas);
        const original = Array.prototype.sort;
        const sortedGaps: number[] = [];
        // eslint-disable-next-line no-extend-native
        Array.prototype.sort = function (this: unknown[], ...args: unknown[]) {
            const first = this[0];
            if (first !== null && typeof first === "object" && "score" in (first as object)) {
                sortedGaps.push(this.length);
            }
            return (original as (...a: unknown[]) => unknown[]).apply(this, args);
        } as typeof Array.prototype.sort;
        try {
            expect(topGaps(fresh, 3)).toEqual(EXPECTED_GAPS.slice(0, 3));
            expect(sortedGaps).toEqual([]);

            // And the other branch, which exists because selection is only cheaper while the held
            // set is small: past SELECTION_MAX it sorts once, deliberately.
            const wide = buildModel(ideas);
            expect(topGaps(wide, SELECTION_MAX + 1)).toEqual(EXPECTED_GAPS);
            expect(sortedGaps).toEqual([EXPECTED_GAPS.length]);
        } finally {
            // eslint-disable-next-line no-extend-native
            Array.prototype.sort = original;
        }
    });
});
