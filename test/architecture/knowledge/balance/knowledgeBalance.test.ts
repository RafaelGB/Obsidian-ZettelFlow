import { describe, it, expect } from "@jest/globals";
import {
    computeKnowledgeBalance,
    CompositionBucket,
    COMPOSITION_BUCKETS,
} from "architecture/knowledge/balance/knowledgeBalance";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

// 10 notes across all five buckets; ref2 has BOTH a source and a question edge (evidence-first).
const model = buildModel([
    idea("ref1.md", "permanent", [], { hasSources: true }),
    idea("ref2.md", "permanent", [{ to: "t", type: "question" }], { hasSources: true }),
    idea("q.md", "permanent", [{ to: "t", type: "question" }]),
    idea("ex.md", "permanent", [{ to: "t", type: "example" }]),
    idea("sup.md", "permanent", [{ to: "t", type: "supports" }]),
    idea("impl.md", "permanent", [{ to: "t", type: "implements" }]),
    idea("c1.md", "permanent", []),
    idea("c2.md", "permanent", [{ to: "t", type: "link" }]),
    idea("c3.md", "permanent", []),
    idea("c4.md", "permanent", []),
]);

const bucket = (key: CompositionBucket) =>
    computeKnowledgeBalance(model).buckets.find((b) => b.key === key)!;

describe("computeKnowledgeBalance (#161, AC-1, AC-2)", () => {
    it("partitions notes into evidence-first buckets with counts + percents", () => {
        expect(bucket("reference")).toEqual({ key: "reference", count: 2, percent: 20 });
        expect(bucket("question")).toEqual({ key: "question", count: 1, percent: 10 });
        expect(bucket("example")).toEqual({ key: "example", count: 1, percent: 10 });
        expect(bucket("conclusion")).toEqual({ key: "conclusion", count: 2, percent: 20 });
        expect(bucket("concept")).toEqual({ key: "concept", count: 4, percent: 40 });
    });

    it("returns buckets in the fixed order, summing counts to the total", () => {
        const balance = computeKnowledgeBalance(model);
        expect(balance.buckets.map((b) => b.key)).toEqual([...COMPOSITION_BUCKETS]);
        expect(balance.buckets.reduce((s, b) => s + b.count, 0)).toBe(balance.total);
        expect(balance.total).toBe(10);
    });

    it("emits no suggestions for a balanced vault (AC-2)", () => {
        expect(computeKnowledgeBalance(model).suggestions).toEqual([]);
    });

    it("suggests add-sources when references are missing (AC-2)", () => {
        const noRefs = buildModel([
            idea("ex1.md", "permanent", [{ to: "t", type: "example" }]),
            idea("ex2.md", "permanent", [{ to: "t", type: "example" }]),
            idea("q1.md", "permanent", [{ to: "t", type: "question" }]),
            idea("cc1.md", "permanent", []),
            idea("cc2.md", "permanent", []),
            idea("cc3.md", "permanent", []),
            idea("cc4.md", "permanent", []),
            idea("cc5.md", "permanent", []),
            idea("cc6.md", "permanent", []),
            idea("cc7.md", "permanent", []),
        ]);
        expect(computeKnowledgeBalance(noRefs).suggestions).toEqual(["add-sources"]);
    });

    it("does not nag a tiny vault below the minimum", () => {
        const tiny = buildModel([
            idea("a.md", "permanent", []),
            idea("b.md", "permanent", []),
            idea("c.md", "permanent", []),
        ]);
        expect(computeKnowledgeBalance(tiny).suggestions).toEqual([]);
    });

    it("is deterministic and returns an all-zero balance for an empty model", () => {
        expect(computeKnowledgeBalance(model)).toEqual(computeKnowledgeBalance(model));
        const empty = computeKnowledgeBalance(buildModel([]));
        expect(empty.total).toBe(0);
        expect(empty.buckets.every((b) => b.count === 0 && b.percent === 0)).toBe(true);
        expect(empty.suggestions).toEqual([]);
    });
});
