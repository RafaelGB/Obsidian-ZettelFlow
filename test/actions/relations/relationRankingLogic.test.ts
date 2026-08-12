import { describe, it, expect } from "@jest/globals";
import { rankRelated } from "actions/relations/relationRankingLogic";
import { idea, buildModel } from "../knowledge/support/knowledgeFixture";

/**
 * Graph shape (all plain `link` edges):
 *   P → source, X, Y      Q → source, X      Z → source, A      W → M
 *   source → A, B         X → A, B           Y → A
 * So, relative to `source`:
 *   inN(source)  = {P, Q, Z}   outN(source) = {A, B}   (A, B, Z already connected)
 *   X: co-citation |{P,Q,Z}∩{P,Q}| = 2, coupling |{A,B}∩{A,B}| = 2 → 2·2 + 1·2 = 6
 *   Y: co-citation |{P,Q,Z}∩{P}|   = 1, coupling |{A,B}∩{A}|   = 1 → 2·1 + 1·1 = 3
 *   W: no shared context → 0 (excluded)
 */
const model = buildModel([
    idea("source.md", "permanent", [{ to: "A.md" }, { to: "B.md" }]),
    idea("P.md", "permanent", [{ to: "source.md" }, { to: "X.md" }, { to: "Y.md" }]),
    idea("Q.md", "permanent", [{ to: "source.md" }, { to: "X.md" }]),
    idea("X.md", "permanent", [{ to: "A.md" }, { to: "B.md" }]),
    idea("Y.md", "permanent", [{ to: "A.md" }]),
    idea("Z.md", "permanent", [{ to: "source.md" }, { to: "A.md" }]),
    idea("W.md", "permanent", [{ to: "M.md" }]),
    idea("A.md", "permanent", []),
    idea("B.md", "permanent", []),
    idea("M.md", "permanent", []),
]);

describe("rankRelated (#154, FR-2, AC-1, D4)", () => {
    it("ranks by shared graph context, strongest first", () => {
        expect(rankRelated(model, "source.md")).toEqual(["X.md", "Y.md"]);
    });

    it("excludes the source itself", () => {
        expect(rankRelated(model, "source.md")).not.toContain("source.md");
    });

    it("excludes notes already directly connected in either direction", () => {
        const ranked = rankRelated(model, "source.md");
        // A.md / B.md are outgoing links of source; Z.md links to source
        expect(ranked).not.toContain("A.md");
        expect(ranked).not.toContain("B.md");
        expect(ranked).not.toContain("Z.md");
    });

    it("excludes candidates with no shared context (score 0)", () => {
        expect(rankRelated(model, "source.md")).not.toContain("W.md");
    });

    it("caps to the top-K when a limit is given", () => {
        expect(rankRelated(model, "source.md", { limit: 1 })).toEqual(["X.md"]);
    });

    it("returns [] for an absent/unknown source without throwing", () => {
        expect(rankRelated(model, "missing.md")).toEqual([]);
    });

    it("is deterministic for the same (model, source)", () => {
        expect(rankRelated(model, "source.md")).toEqual(rankRelated(model, "source.md"));
    });

    it("breaks score ties by path ascending (stable order)", () => {
        const tie = buildModel([
            idea("s.md", "permanent", [{ to: "t.md" }]),
            idea("b.md", "permanent", [{ to: "t.md" }]),
            idea("a.md", "permanent", [{ to: "t.md" }]),
            idea("t.md", "permanent", []),
        ]);
        expect(rankRelated(tie, "s.md")).toEqual(["a.md", "b.md"]);
    });
});
