import { describe, it, expect } from "@jest/globals";
import { suggestNextMoves, NEXT_MOVE_TOKENS } from "actions/suggestNextMove/nextMoveLogic";
import { idea, buildModel } from "./support/knowledgeFixture";

describe("suggestNextMoves (#158, FR-2/FR-3/FR-4, AC-1, AC-2)", () => {
    it("returns every token, in the fixed order, when all preconditions hold", () => {
        // a.md: fleeting, no outgoing (connect), an incoming link (degree>0, no example → add-example),
        // a claim without a source (add-source), early state (advance-state).
        const model = buildModel([
            idea("a.md", "fleeting", [], { claims: [{ text: "an idea" }] }),
            idea("b.md", "permanent", [{ to: "a.md" }]),
        ]);
        expect(suggestNextMoves(model, "a.md")).toEqual([...NEXT_MOVE_TOKENS]);
    });

    it("suggests add-source for a claim with no source", () => {
        const model = buildModel([
            idea("s.md", "permanent", [{ to: "x.md", type: "example" }], {
                claims: [{ text: "c" }],
                hasSources: false,
            }),
        ]);
        expect(suggestNextMoves(model, "s.md")).toContain("add-source");
    });

    it("suggests connect only when there are no outgoing links", () => {
        const connected = buildModel([idea("c.md", "permanent", [{ to: "x.md", type: "example" }], { hasSources: true })]);
        expect(suggestNextMoves(connected, "c.md")).not.toContain("connect");
        const isolated = buildModel([idea("i.md", "permanent", [], { hasSources: true })]);
        expect(suggestNextMoves(isolated, "i.md")).toContain("connect");
    });

    it("suggests add-example only when connected but lacking an example relation", () => {
        const withExample = buildModel([idea("e.md", "permanent", [{ to: "x.md", type: "example" }], { hasSources: true })]);
        expect(suggestNextMoves(withExample, "e.md")).not.toContain("add-example");
        const noExample = buildModel([
            idea("n.md", "permanent", [{ to: "x.md" }], { hasSources: true }),
        ]);
        expect(suggestNextMoves(noExample, "n.md")).toContain("add-example");
    });

    it("suggests advance-state for early/unknown states but not permanent/evergreen/archived", () => {
        const complete = (state: string) =>
            buildModel([idea("p.md", state, [{ to: "x.md", type: "example" }], { hasSources: true })]);
        expect(suggestNextMoves(complete("fleeting"), "p.md")).toContain("advance-state");
        expect(suggestNextMoves(complete("made-up-state"), "p.md")).toContain("advance-state");
        expect(suggestNextMoves(complete("permanent"), "p.md")).not.toContain("advance-state");
        expect(suggestNextMoves(complete("evergreen"), "p.md")).not.toContain("advance-state");
        expect(suggestNextMoves(complete("archived"), "p.md")).not.toContain("advance-state");
    });

    it("returns [] for a fully-developed (complete) idea", () => {
        const model = buildModel([
            idea("done.md", "permanent", [{ to: "x.md", type: "example" }, { to: "y.md" }], {
                hasSources: true,
                claims: [{ text: "c", sources: [{ ref: "src", kind: "text" }] }],
            }),
        ]);
        expect(suggestNextMoves(model, "done.md")).toEqual([]);
    });

    it("yields at least one token for any non-complete idea", () => {
        const model = buildModel([idea("f.md", "fleeting", [])]);
        expect(suggestNextMoves(model, "f.md").length).toBeGreaterThanOrEqual(1);
    });

    it("returns [] for an unknown target and is read-only + deterministic", () => {
        const model = buildModel([idea("a.md", "fleeting", [])]);
        expect(suggestNextMoves(model, "missing.md")).toEqual([]);
        const before = model.all().length;
        expect(suggestNextMoves(model, "a.md")).toEqual(suggestNextMoves(model, "a.md"));
        expect(model.all().length).toBe(before);
    });
});
