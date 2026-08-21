import { describe, it, expect } from "@jest/globals";
import { findUnansweredQuestions } from "architecture/knowledge/query/findUnansweredQuestionLogic";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

const model = buildModel([
    // note asks q1 (unanswered) and q2 (answered by a supports edge into it)
    idea("note.md", "permanent", [
        { to: "q1.md", type: "question" },
        { to: "q2.md", type: "question" },
    ]),
    idea("q1.md", "permanent", []),
    idea("q2.md", "permanent", []),
    idea("answer.md", "permanent", [{ to: "q2.md", type: "supports" }]),
    idea("plain.md", "permanent", [{ to: "x.md" }]),
]);

describe("findUnansweredQuestions (#153, FR-S4, AC-1)", () => {
    it("returns question targets that have no incoming supports edge", () => {
        expect(findUnansweredQuestions(model, "note.md")).toEqual(["q1.md"]);
    });

    it("omits a question that has been answered (a supports edge points into it)", () => {
        expect(findUnansweredQuestions(model, "note.md")).not.toContain("q2.md");
    });

    it("returns an empty list when there is no question edge", () => {
        expect(findUnansweredQuestions(model, "plain.md")).toEqual([]);
    });
});
