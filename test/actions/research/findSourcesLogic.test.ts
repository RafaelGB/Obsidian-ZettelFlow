import { describe, it, expect } from "@jest/globals";
import { findSources } from "actions/findSources/findSourcesLogic";
import { ideaWithClaims, buildModel } from "./support/researchFixture";

const src = (ref: string) => ({ ref, kind: "text" as const });

// Vault reference counts: src3 = 3, src1 = 2, src2 = 1. Target t.md is unsourced, neighbour cites src1.
const model = buildModel([
    ideaWithClaims("t.md", [{ text: "needs sourcing" }], [{ to: "n1.md" }]),
    ideaWithClaims("n1.md", [{ text: "c", sources: [src("src1")] }]),
    ideaWithClaims("x1.md", [{ text: "c", sources: [src("src1")] }]),
    ideaWithClaims("x2.md", [{ text: "c", sources: [src("src2")] }]),
    ideaWithClaims("y1.md", [{ text: "c", sources: [src("src3")] }]),
    ideaWithClaims("y2.md", [{ text: "c", sources: [src("src3")] }]),
    ideaWithClaims("y3.md", [{ text: "c", sources: [src("src3")] }]),
]);

describe("findSources (#155, FR-5, D5, AC-3)", () => {
    it("ranks a neighbour's source first, then by reference count descending", () => {
        // src1 is cited by the neighbour n1.md, so it leads despite src3's higher vault count.
        expect(findSources(model, "t.md").map((s) => s.ref)).toEqual(["src1", "src3", "src2"]);
    });

    it("caps to the top-K limit", () => {
        expect(findSources(model, "t.md", { limit: 1 }).map((s) => s.ref)).toEqual(["src1"]);
    });

    it("returns [] for an already-sourced target", () => {
        const sourced = buildModel([
            ideaWithClaims("s.md", [{ text: "c", sources: [src("done")] }]),
            ideaWithClaims("o.md", [{ text: "c", sources: [src("other")] }]),
        ]);
        expect(findSources(sourced, "s.md")).toEqual([]);
    });

    it("returns [] for an unknown target and an empty model", () => {
        expect(findSources(model, "missing.md")).toEqual([]);
        expect(findSources(buildModel([]), "anything.md")).toEqual([]);
    });

    it("breaks reference-count ties by source key ascending", () => {
        const tie = buildModel([
            ideaWithClaims("qt.md", [{ text: "needs sourcing" }]),
            ideaWithClaims("q1.md", [{ text: "c", sources: [src("bbb")] }]),
            ideaWithClaims("q2.md", [{ text: "c", sources: [src("aaa")] }]),
        ]);
        expect(findSources(tie, "qt.md").map((s) => s.ref)).toEqual(["aaa", "bbb"]);
    });

    it("is deterministic across runs", () => {
        expect(findSources(model, "t.md")).toEqual(findSources(model, "t.md"));
    });
});
