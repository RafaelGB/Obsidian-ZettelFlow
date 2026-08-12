import { describe, it, expect } from "@jest/globals";
import {
    computeKnowledgeDebt,
    severityBucket,
    DebtCategoryKey,
} from "architecture/knowledge/debt/knowledgeDebt";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

// total = 4. iso: unreferenced+dangling+unsourced. hub: unreferenced. leaf: dangling. q: unreferenced+open-question.
const model = buildModel([
    idea("iso.md", "permanent", [], { claims: [{ text: "a claim" }] }),
    idea("hub.md", "permanent", [{ to: "leaf.md" }], { hasSources: true }),
    idea("leaf.md", "permanent", []),
    idea("q.md", "permanent", [{ to: "leaf.md", type: "question" }], { hasSources: true }),
]);

const paths = (key: DebtCategoryKey) =>
    computeKnowledgeDebt(model).categories.find((c) => c.key === key)!.paths;

describe("computeKnowledgeDebt (#159, AC-1, AC-2)", () => {
    it("counts each debt category with its sorted affected paths (AC-1b)", () => {
        expect(paths("unreferenced")).toEqual(["hub.md", "iso.md", "q.md"]);
        expect(paths("dangling")).toEqual(["iso.md", "leaf.md"]);
        expect(paths("unsourced")).toEqual(["iso.md"]);
        expect(paths("open-question")).toEqual(["q.md"]);
    });

    it("computes the weighted 0-100 debt score (AC-1c)", () => {
        // 0.25·¾ + 0.20·½ + 0.30·¼ + 0.25·¼ = 0.425 → 43
        expect(computeKnowledgeDebt(model).score).toBe(43);
        expect(computeKnowledgeDebt(model).total).toBe(4);
    });

    it("is deterministic and read-only (AC-1c)", () => {
        const before = model.all().map((i) => i.path).sort();
        expect(computeKnowledgeDebt(model)).toEqual(computeKnowledgeDebt(model));
        expect(model.all().map((i) => i.path).sort()).toEqual(before);
    });

    it("scores an empty model as 0 with empty categories (AC-1d)", () => {
        const empty = computeKnowledgeDebt(buildModel([]));
        expect(empty.score).toBe(0);
        expect(empty.total).toBe(0);
        expect(empty.categories.every((c) => c.count === 0)).toBe(true);
    });

    it("buckets severity at the documented thresholds", () => {
        expect(severityBucket(33)).toBe("low");
        expect(severityBucket(34)).toBe("medium");
        expect(severityBucket(66)).toBe("medium");
        expect(severityBucket(67)).toBe("high");
    });

    it("exposes a remediation token per category, over openable notes (AC-2)", () => {
        const debt = computeKnowledgeDebt(model);
        const expected: Record<DebtCategoryKey, string> = {
            unreferenced: "connect",
            dangling: "connect",
            unsourced: "add-source",
            "open-question": "answer-question",
        };
        for (const category of debt.categories) {
            expect(category.remediation).toBe(expected[category.key]);
            for (const path of category.paths) expect(model.get(path)).toBeDefined();
        }
    });
});
