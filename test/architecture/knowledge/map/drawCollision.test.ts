import { describe, it, expect } from "@jest/globals";
import {
    drawCollision,
    COLLISION_DRAW_ATTEMPTS,
    type Collision,
} from "architecture/knowledge/map/drawCollision";
import { gapTally } from "architecture/knowledge/discovery/discoveries";
import { collisionVerdict } from "architecture/knowledge/judgement/collisionVerdict";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

/**
 * Two dense neighbourhoods, one link across them, and a note nothing touches.
 *
 *     hubA → a1 a2 a3 a4        hubB → b1 b2 b3 b4        lonely
 *                     a1 → b1 (the one crossing)
 */
const twoClusters = buildModel([
    idea("hubA.md", "permanent", [{ to: "a1.md" }, { to: "a2.md" }, { to: "a3.md" }, { to: "a4.md" }]),
    idea("a1.md", "permanent", [{ to: "b1.md" }]),
    idea("a2.md", "permanent", []),
    idea("a3.md", "permanent", []),
    idea("a4.md", "permanent", []),
    idea("hubB.md", "permanent", [{ to: "b1.md" }, { to: "b2.md" }, { to: "b3.md" }, { to: "b4.md" }]),
    idea("b1.md", "permanent", []),
    idea("b2.md", "permanent", []),
    idea("b3.md", "permanent", []),
    idea("b4.md", "permanent", []),
    idea("lonely.md", "permanent", []),
]);

/** One star: everything hangs off a single hub, so there is nothing far from anything. */
const oneStar = buildModel([
    idea("hub.md", "permanent", [{ to: "n1.md" }, { to: "n2.md" }, { to: "n3.md" }]),
    idea("n1.md", "permanent", []),
    idea("n2.md", "permanent", []),
    idea("n3.md", "permanent", []),
]);

/** Six notes, no links at all. Every one of them stands alone. */
const allAlone = buildModel([
    idea("i1.md", "fleeting", []),
    idea("i2.md", "fleeting", []),
    idea("i3.md", "fleeting", []),
    idea("i4.md", "fleeting", []),
    idea("i5.md", "fleeting", []),
    idea("i6.md", "fleeting", []),
]);

const draws = (model: Parameters<typeof drawCollision>[0], count: number, over: Partial<Parameters<typeof drawCollision>[1]> = {}) =>
    Array.from({ length: count }, (_, seed) => drawCollision(model, { seed: seed + 1, ...over })).filter(
        (pair): pair is Collision => pair !== null
    );

/**
 * A pair from nowhere near (#566, epic #559).
 *
 * The complement of a gap, and the only reader in the product for which a note that stands alone is
 * prime material rather than a limitation (#529: *the loneliest notes get nothing from this lens*).
 */
describe("a drawn pair has nothing in common (#566)", () => {
    it("never shares a neighbour, and is never something the gap tally can see", () => {
        const pairs = draws(twoClusters, 100, { distance: "very-far" });
        expect(pairs.length).toBeGreaterThan(0);
        const tally = gapTally(twoClusters);
        for (const pair of pairs) {
            // A gap is a pair that **shares** context. If the tally can score it, it is not a
            // collision — the two readers are complements, and this is the assertion that says so.
            expect({ pair: `${pair.a}|${pair.b}`, score: tally.scoreOf(pair.a, pair.b) }).toEqual({
                pair: `${pair.a}|${pair.b}`,
                score: undefined,
            });
        }
    });

    it("never draws a pair that is already linked", () => {
        // A link is **not** a shared neighbour — `a1 → b1` leaves both intersections empty — so this
        // is an explicit test, not a consequence. The epic's FR-10 said otherwise and was wrong.
        for (const pair of draws(twoClusters, 200, { distance: "very-far" })) {
            expect(`${pair.a}->${pair.b}`).not.toBe("a1.md->b1.md");
        }
    });

    it("returns the pair in a canonical order", () => {
        for (const pair of draws(twoClusters, 50, { distance: "very-far" })) {
            expect(pair.a <= pair.b).toBe(true);
        }
    });
});

describe("the same seed draws the same pair (#566)", () => {
    it("is deterministic", () => {
        const once = drawCollision(twoClusters, { seed: 7, distance: "very-far" });
        const twice = drawCollision(twoClusters, { seed: 7, distance: "very-far" });
        expect(twice).toEqual(once);
    });

    it("is not an accidental constant", () => {
        const seen = new Set(draws(twoClusters, 100, { distance: "very-far" }).map((p) => `${p.a}|${p.b}`));
        expect(seen.size).toBeGreaterThan(1);
    });
});

describe("how far apart, and the loneliest notes (#566)", () => {
    it("says nothing at all when there is nowhere far enough away", () => {
        // One star is one community and one region: *far* has no bucket to draw from, and the
        // answer is `null` immediately rather than after two hundred futile attempts.
        expect(drawCollision(oneStar, { seed: 1 })).toBeNull();
        expect(drawCollision(oneStar, { seed: 2, distance: "very-far" })).toBeNull();
    });

    it("gives a vault of isolated notes its first pair-finder", () => {
        // Every note here is `alone`: no community, no region. The gap lens can say nothing about
        // any of them, which is exactly why this exists.
        const pairs = draws(allAlone, 20, { distance: "very-far" });
        expect(pairs.length).toBeGreaterThan(0);
        for (const pair of pairs) expect(pair.a).not.toBe(pair.b);
    });

    it("reaches the note that stands alone", () => {
        const touched = draws(twoClusters, 200, { distance: "very-far" }).some(
            (pair) => pair.a === "lonely.md" || pair.b === "lonely.md"
        );
        expect(touched).toBe(true);
    });

    it("keeps the two distances apart", () => {
        const far = draws(twoClusters, 50);
        const veryFar = draws(twoClusters, 50, { distance: "very-far" });
        expect(far.every((pair) => pair.distance === "far")).toBe(true);
        expect(veryFar.every((pair) => pair.distance === "very-far")).toBe(true);
    });
});

describe("what the draw refuses (#566)", () => {
    it("never returns a pair you have ruled out", () => {
        const first = drawCollision(twoClusters, { seed: 1, distance: "very-far" });
        expect(first).not.toBeNull();
        // The real record, not a stub: the draw reads the ruled-out pairs out of it itself, so
        // this is the same path the panel and a script take (#568).
        const ruledOut = [
            { at: 1, ...collisionVerdict(first?.a ?? "", first?.b ?? "") },
        ];
        for (const pair of draws(twoClusters, 300, { distance: "very-far", ruledOut })) {
            expect(`${pair.a}|${pair.b}`).not.toBe(`${first?.a}|${first?.b}`);
        }
    });

    it("keeps the note you anchored it to", () => {
        const pairs = draws(twoClusters, 30, { distance: "very-far", from: "lonely.md" });
        expect(pairs.length).toBeGreaterThan(0);
        for (const pair of pairs) {
            expect(pair.a === "lonely.md" || pair.b === "lonely.md").toBe(true);
        }
    });

    it("says nothing rather than guessing, for a note it does not know", () => {
        expect(drawCollision(twoClusters, { seed: 1, from: "nowhere.md" })).toBeNull();
    });

    it("has nothing to say about an empty or single-note vault", () => {
        expect(drawCollision(buildModel([]), { seed: 1 })).toBeNull();
        expect(drawCollision(buildModel([idea("only.md", "fleeting", [])]), { seed: 1 })).toBeNull();
    });

    it("is bounded, and says so", () => {
        expect(COLLISION_DRAW_ATTEMPTS).toBeGreaterThan(0);
        expect(COLLISION_DRAW_ATTEMPTS).toBeLessThanOrEqual(1000);
    });
});
