import { describe, it, expect } from "@jest/globals";
import { buildEvidenceMap } from "architecture/knowledge/synthesis/evidenceMap";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

// focus.md: supports→sup_out, contradicts→con, question→q1; one sourced + one unsourced claim.
// sup_out.md: a sourced claim. sup_in.md: supports→focus. con.md / q1.md: bare.
const model = buildModel([
    idea(
        "focus.md",
        "permanent",
        [
            { to: "sup_out.md", type: "supports" },
            { to: "con.md", type: "contradicts" },
            { to: "q1.md", type: "question" },
        ],
        {
            claims: [
                { text: "focus sourced", sources: [{ ref: "Book A", kind: "text" }] },
                { text: "unsourced claim", sources: [] },
            ],
        }
    ),
    idea("sup_out.md", "permanent", [], { claims: [{ text: "sup evidence", sources: [{ ref: "[[Ref Note]]", kind: "link" }] }] }),
    idea("sup_in.md", "permanent", [{ to: "focus.md", type: "supports" }]),
    idea("con.md", "permanent", []),
    idea("q1.md", "permanent", []),
]);

describe("buildEvidenceMap (#169, FR-1..FR-7, AC-1)", () => {
    it("assembles the four grounded buckets from the graph", () => {
        expect(buildEvidenceMap(model, "focus.md")).toEqual({
            focus: "focus.md",
            supports: ["sup_in.md", "sup_out.md"],
            contradicts: ["con.md"],
            evidence: [
                { note: "focus.md", claim: "focus sourced", source: { ref: "Book A", kind: "text" } },
                { note: "sup_out.md", claim: "sup evidence", source: { ref: "[[Ref Note]]", kind: "link" } },
            ],
            gaps: {
                unsourcedClaims: [{ note: "focus.md", claim: "unsourced claim" }],
                openQuestions: ["q1.md"],
            },
        });
    });

    it("never emits an unsourced claim as evidence", () => {
        const map = buildEvidenceMap(model, "focus.md");
        expect(map.evidence.map((entry) => entry.claim)).not.toContain("unsourced claim");
    });

    it("returns an empty map for an unknown/unindexed focus", () => {
        expect(buildEvidenceMap(model, "missing.md")).toEqual({
            focus: "missing.md",
            supports: [],
            contradicts: [],
            evidence: [],
            gaps: { unsourcedClaims: [], openQuestions: [] },
        });
    });

    it("is deterministic and read-only", () => {
        const before = model.size();
        expect(buildEvidenceMap(model, "focus.md")).toEqual(buildEvidenceMap(model, "focus.md"));
        expect(model.size()).toBe(before);
    });
});
