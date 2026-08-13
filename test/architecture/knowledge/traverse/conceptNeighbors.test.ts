import { describe, it, expect } from "@jest/globals";
import { conceptNeighbors } from "architecture/knowledge/traverse/conceptNeighbors";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

// focus.md: outgoing edges of several types (incl. contradicts/link), plus three incoming edges.
const model = buildModel([
    idea("focus.md", "permanent", [
        { to: "o_b.md", type: "supports" },
        { to: "o_a.md", type: "supports" },
        { to: "o_e.md", type: "example" },
        { to: "o_c.md", type: "contradicts" },
        { to: "o_l.md" }, // link (default type)
    ]),
    idea("in1.md", "permanent", [{ to: "focus.md", type: "expands" }]),
    idea("in2.md", "permanent", [{ to: "focus.md", type: "question" }]),
    idea("in3.md", "permanent", [{ to: "focus.md", type: "supports" }]),
]);

describe("conceptNeighbors (#166, FR-6, AC-2 pure part)", () => {
    it("groups all typed neighbours out-before-in, in vocabulary order, targets path-sorted", () => {
        expect(conceptNeighbors(model, "focus.md")).toEqual({
            focus: "focus.md",
            groups: [
                { type: "supports", direction: "out", targets: ["o_a.md", "o_b.md"] },
                { type: "contradicts", direction: "out", targets: ["o_c.md"] },
                { type: "example", direction: "out", targets: ["o_e.md"] },
                { type: "link", direction: "out", targets: ["o_l.md"] },
                { type: "supports", direction: "in", targets: ["in3.md"] },
                { type: "expands", direction: "in", targets: ["in1.md"] },
                { type: "question", direction: "in", targets: ["in2.md"] },
            ],
        });
    });

    it("returns empty groups for an unknown/unindexed focus", () => {
        expect(conceptNeighbors(model, "missing.md")).toEqual({ focus: "missing.md", groups: [] });
    });

    it("is deterministic and read-only", () => {
        const before = model.size();
        expect(conceptNeighbors(model, "focus.md")).toEqual(conceptNeighbors(model, "focus.md"));
        expect(model.size()).toBe(before);
    });
});
