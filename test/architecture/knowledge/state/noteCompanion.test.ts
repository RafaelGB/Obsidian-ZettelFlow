import { describe, it, expect } from "@jest/globals";
import {
    noteVitals,
    lifecycleStepper,
    companionSections,
    buildEvidenceMap,
} from "architecture/knowledge/state";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

// The spec's note A: three notes link to it, it links nowhere, it makes two claims and cites nothing.
// focus.md is the evidence-map fixture, so the sections can be proved equal to what it computes.
const model = buildModel([
    idea("A.md", "literature", [], {
        claims: [{ text: "first" }, { text: "second" }],
    }),
    idea("b.md", "permanent", [{ to: "A.md" }]),
    idea("c.md", "permanent", [{ to: "A.md", type: "supports" }]),
    idea("d.md", "permanent", [{ to: "A.md", type: "contradicts" }]),
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
                { text: "also sourced", sources: [{ ref: "Book A", kind: "text" }, { ref: "Book B", kind: "text" }] },
                { text: "unsourced claim", sources: [] },
            ],
        }
    ),
    idea("sup_out.md", "permanent", [], { claims: [{ text: "sup evidence", sources: [{ ref: "[[Ref Note]]", kind: "link" }] }] }),
    idea("sup_in.md", "permanent", [{ to: "focus.md", type: "supports" }]),
    idea("con.md", "permanent", []),
    idea("q1.md", "permanent", []),
]);

const nearby = [
    { path: "far.md", basename: "far", reasons: ["tag"] },
    { path: "old.md", basename: "old", reasons: ["link"] },
];

describe("noteVitals (#640 FR-9) — counts, never a grade", () => {
    it("counts links in, links out, claims and sources of note A", () => {
        expect(noteVitals(model, "A.md")).toEqual({ linksIn: 3, linksOut: 0, claims: 2, sources: 0 });
    });

    it("counts each distinct source once across the note's claims", () => {
        expect(noteVitals(model, "focus.md")).toEqual({ linksIn: 1, linksOut: 3, claims: 3, sources: 2 });
    });

    it("is all zeros for a note the model does not know", () => {
        expect(noteVitals(model, "missing.md")).toEqual({ linksIn: 0, linksOut: 0, claims: 0, sources: 0 });
    });
});

describe("lifecycleStepper (#640 FR-8)", () => {
    const statuses = (state: string, recognised: boolean) =>
        lifecycleStepper(state, recognised).steps.map((step) => `${step.state}:${step.status}`);

    it("marks the earlier states done and the note's own state current", () => {
        expect(statuses("literature", true)).toEqual(["fleeting:done", "literature:current", "permanent:todo"]);
    });

    it("carries a label key per step", () => {
        expect(lifecycleStepper("fleeting", true).steps[0].labelKey).toBe("lifecycle_state_fleeting");
    });

    it("extends the line only when the note is past permanent", () => {
        expect(statuses("developing", true)).toEqual([
            "fleeting:done",
            "literature:done",
            "permanent:done",
            "developing:current",
        ]);
    });

    it("has no current step when the note has no recognised state", () => {
        expect(statuses("fleeting", false)).toEqual(["fleeting:todo", "literature:todo", "permanent:todo"]);
    });

    it("has no current step for an archived note", () => {
        expect(lifecycleStepper("archived", true).steps.some((step) => step.status === "current")).toBe(false);
    });
});

describe("companionSections (#640 FR-11/12/13)", () => {
    const map = buildEvidenceMap(model, "focus.md");

    it("keeps the fixed order and shows exactly what the evidence map computed", () => {
        const { sections, folded } = companionSections(map, nearby);
        expect(sections.map((section) => section.id)).toEqual(["tension", "supports", "gaps", "nearby"]);
        expect(folded).toEqual([]);

        const [tension, supports, gaps, near] = sections;
        expect(tension).toEqual({ id: "tension", count: 1, notes: map.contradicts });
        expect(supports).toEqual({
            id: "supports",
            count: map.supports.length + map.evidence.length,
            notes: map.supports,
            evidence: map.evidence,
        });
        expect(gaps).toEqual({
            id: "gaps",
            count: 2,
            unsourcedClaims: map.gaps.unsourcedClaims,
            openQuestions: map.gaps.openQuestions,
        });
        expect(near).toEqual({ id: "nearby", count: 2, rows: nearby });
    });

    it("folds the empty sections into one list instead of drawing them", () => {
        const { sections, folded } = companionSections(buildEvidenceMap(model, "A.md"), []);
        expect(sections.map((section) => section.id)).toEqual(["tension", "supports", "gaps"]);
        expect(folded).toEqual(["nearby"]);
    });

    it("draws nothing but the folded line when everything is empty", () => {
        expect(companionSections(null, [])).toEqual({
            sections: [],
            folded: ["tension", "supports", "gaps", "nearby"],
        });
    });
});
