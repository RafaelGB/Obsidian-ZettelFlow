import { describe, it, expect } from "@jest/globals";
import { proposeAnswers } from "architecture/knowledge/questions/proposeAnswers";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

// q.md is an open question. Candidates by shared graph context (rankRelated):
//   c2 — co-cited with q by P1 & P2 (score 2·2 = 4)
//   c1 — couples with q via S    (score 1·1 = 1)
//   ask — asks q (--question-->), an in-neighbour ⇒ excluded from the ranking.
// aq.md is an ANSWERED question (incoming supports); lonely.md is a context-less question.
const model = buildModel([
    idea("q.md", "permanent", [{ to: "S.md" }]),
    idea("ask.md", "permanent", [{ to: "q.md", type: "question" }]),
    idea("P1.md", "permanent", [{ to: "q.md" }, { to: "c2.md" }]),
    idea("P2.md", "permanent", [{ to: "q.md" }, { to: "c2.md" }]),
    idea("c2.md", "permanent", []),
    idea("c1.md", "permanent", [{ to: "S.md" }]),
    idea("S.md", "permanent", []),
    idea("ans.md", "permanent", [{ to: "aq.md", type: "question" }]),
    idea("sup.md", "permanent", [{ to: "aq.md", type: "supports" }]),
    idea("aq.md", "permanent", []),
    idea("asker2.md", "permanent", [{ to: "lonely.md", type: "question" }]),
    idea("lonely.md", "permanent", []),
]);

describe("proposeAnswers (#167, FR-3/FR-4/FR-5, AC-2)", () => {
    it("ranks candidate answers by relatedness, strongest first, with non-increasing score", () => {
        expect(proposeAnswers(model, "q.md")).toEqual([
            { path: "c2.md", score: 4 },
            { path: "c1.md", score: 1 },
        ]);
    });

    it("excludes the asking note (it is directly connected)", () => {
        expect(proposeAnswers(model, "q.md").map((candidate) => candidate.path)).not.toContain("ask.md");
    });

    it("honours the limit", () => {
        expect(proposeAnswers(model, "q.md", { limit: 1 })).toEqual([{ path: "c2.md", score: 4 }]);
    });

    it("returns [] for an unknown question, an already-answered question, and a context-less question", () => {
        expect(proposeAnswers(model, "missing.md")).toEqual([]);
        expect(proposeAnswers(model, "aq.md")).toEqual([]);
        expect(proposeAnswers(model, "lonely.md")).toEqual([]);
    });

    it("is read-only", () => {
        const before = model.size();
        proposeAnswers(model, "q.md");
        expect(model.size()).toBe(before);
    });
});
