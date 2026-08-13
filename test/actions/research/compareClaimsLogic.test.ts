import { describe, it, expect } from "@jest/globals";
import {
    compareClaims,
    normalize,
    hasNegation,
    stripNegation,
} from "actions/compareClaims/compareClaimsLogic";
import { ideaWithClaims, buildModel } from "./support/researchFixture";

describe("compareClaims helpers (#155, FR-3, D4)", () => {
    it("normalizes: trim, lowercase, collapse spaces, strip quotes and trailing punctuation", () => {
        expect(normalize('  "Coffee   is Healthy."  ')).toBe("coffee is healthy");
    });

    it("detects negation over the closed bilingual marker set", () => {
        expect(hasNegation("coffee is not healthy")).toBe(true);
        expect(hasNegation("el cafe no es sano")).toBe(true);
        expect(hasNegation("nunca duermo")).toBe(true);
        expect(hasNegation("coffee is healthy")).toBe(false);
    });

    it("strips negation markers so opposite-polarity propositions share a base", () => {
        expect(stripNegation("coffee is not healthy")).toBe("coffee is healthy");
    });
});

describe("compareClaims (#155, FR-3, D4, AC-2)", () => {
    it("flags a structural contradiction via a contradicts relation, regardless of text", () => {
        const model = buildModel([
            ideaWithClaims("a.md", [{ text: "Sleep improves memory" }], [{ to: "b.md", type: "contradicts" }]),
            ideaWithClaims("b.md", [{ text: "Something entirely unrelated" }]),
        ]);
        const result = compareClaims(model, "a.md");
        expect(result.contradicting).toEqual([{ path: "b.md", text: "Something entirely unrelated" }]);
        expect(result.agreeing).toEqual([]);
    });

    it("flags a textual contradiction on an opposite-polarity copular claim", () => {
        const model = buildModel([
            ideaWithClaims("a.md", [{ text: "Coffee is healthy" }]),
            ideaWithClaims("c.md", [{ text: "Coffee is not healthy" }]),
        ]);
        expect(compareClaims(model, "a.md").contradicting).toEqual([
            { path: "c.md", text: "Coffee is not healthy" },
        ]);
    });

    it("flags agreement on identical normalized claim text", () => {
        const model = buildModel([
            ideaWithClaims("a.md", [{ text: "Coffee is healthy" }]),
            ideaWithClaims("d.md", [{ text: "coffee is healthy." }]),
        ]);
        const result = compareClaims(model, "a.md");
        expect(result.agreeing).toEqual([{ path: "d.md", text: "coffee is healthy." }]);
        expect(result.contradicting).toEqual([]);
    });

    it("leaves an unrelated claim in neither set", () => {
        const model = buildModel([
            ideaWithClaims("a.md", [{ text: "Coffee is healthy" }]),
            ideaWithClaims("e.md", [{ text: "Grass is green" }]),
        ]);
        const result = compareClaims(model, "a.md");
        expect(result.agreeing).toEqual([]);
        expect(result.contradicting).toEqual([]);
    });

    it("is deterministic and sorted by path across runs", () => {
        const model = buildModel([
            ideaWithClaims("a.md", [{ text: "Coffee is healthy" }]),
            ideaWithClaims("z.md", [{ text: "coffee is healthy" }]),
            ideaWithClaims("d.md", [{ text: "coffee is healthy" }]),
        ]);
        const first = compareClaims(model, "a.md");
        expect(first.agreeing.map((m) => m.path)).toEqual(["d.md", "z.md"]);
        expect(compareClaims(model, "a.md")).toEqual(first);
    });

    it("returns empty sets for an unknown target without throwing", () => {
        const model = buildModel([ideaWithClaims("a.md", [{ text: "x" }])]);
        expect(compareClaims(model, "missing.md")).toEqual({ agreeing: [], contradicting: [] });
    });
});
