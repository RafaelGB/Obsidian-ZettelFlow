import { describe, it, expect } from "@jest/globals";
import { openQuestions } from "architecture/knowledge/questions/openQuestions";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

// a --question--> q1 (open, 1 asker) · b,c --question--> q2 (open, 2 askers)
// d --question--> aq, e --supports--> aq (ANSWERED — excluded) · n --link--> x (no question edge)
const model = buildModel([
    idea("a.md", "permanent", [{ to: "q1.md", type: "question" }]),
    idea("b.md", "permanent", [{ to: "q2.md", type: "question" }]),
    idea("c.md", "permanent", [{ to: "q2.md", type: "question" }]),
    idea("d.md", "permanent", [{ to: "aq.md", type: "question" }]),
    idea("e.md", "permanent", [{ to: "aq.md", type: "supports" }]),
    idea("n.md", "permanent", [{ to: "x.md" }]),
]);

describe("openQuestions (#167, FR-1/FR-2, AC-1)", () => {
    it("lists every unanswered question vault-wide with its askers, sorted", () => {
        expect(openQuestions(model)).toEqual([
            { path: "q1.md", askedBy: ["a.md"] },
            { path: "q2.md", askedBy: ["b.md", "c.md"] },
        ]);
    });

    it("excludes a question that already has an incoming supports edge", () => {
        expect(openQuestions(model).map((q) => q.path)).not.toContain("aq.md");
    });

    it("returns [] for an empty model", () => {
        expect(openQuestions(buildModel([]))).toEqual([]);
    });

    it("is deterministic and read-only", () => {
        const before = model.size();
        expect(openQuestions(model)).toEqual(openQuestions(model));
        expect(model.size()).toBe(before);
    });
});
