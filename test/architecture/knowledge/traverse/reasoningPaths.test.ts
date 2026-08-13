import { describe, it, expect } from "@jest/globals";
import {
    reasoningPaths,
    ARGUMENT_FORWARD_RELATION_TYPES,
} from "architecture/knowledge/traverse/reasoningPaths";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

// Main argument graph (forward types: supports > expands > example > implements):
//   a --supports--> b --expands--> d --example--> e --implements--> f --supports--> a (cycle)
//   a --expands--> c (leaf)
//   a --contradicts--> xc · a --question--> xq · a --link--> xl   (all EXCLUDED noise)
// Cap chain: p1 --s--> p2 --s--> p3 --s--> p4 --s--> p5 --s--> p6 --s--> p7 (7 nodes, >5 steps).
const model = buildModel([
    idea("a.md", "permanent", [
        { to: "b.md", type: "supports" },
        { to: "c.md", type: "expands" },
        { to: "xc.md", type: "contradicts" },
        { to: "xq.md", type: "question" },
        { to: "xl.md" }, // link (default type) — excluded
    ]),
    idea("b.md", "permanent", [{ to: "d.md", type: "expands" }]),
    idea("c.md", "permanent", []),
    idea("d.md", "permanent", [{ to: "e.md", type: "example" }]),
    idea("e.md", "permanent", [{ to: "f.md", type: "implements" }]),
    idea("f.md", "permanent", [{ to: "a.md", type: "supports" }]),
    idea("p1.md", "permanent", [{ to: "p2.md", type: "supports" }]),
    idea("p2.md", "permanent", [{ to: "p3.md", type: "supports" }]),
    idea("p3.md", "permanent", [{ to: "p4.md", type: "supports" }]),
    idea("p4.md", "permanent", [{ to: "p5.md", type: "supports" }]),
    idea("p5.md", "permanent", [{ to: "p6.md", type: "supports" }]),
    idea("p6.md", "permanent", [{ to: "p7.md", type: "supports" }]),
]);

describe("reasoningPaths (#166, FR-2..FR-5, AC-1)", () => {
    it("exposes the argument-forward relation set in precedence order", () => {
        expect([...ARGUMENT_FORWARD_RELATION_TYPES]).toEqual(["supports", "expands", "example", "implements"]);
    });

    it("returns the maximal argument chains, branch-precedence ordered, ignoring excluded types and cycles", () => {
        expect(reasoningPaths(model, "a.md")).toEqual([
            {
                start: "a.md",
                steps: [
                    { type: "supports", to: "b.md" },
                    { type: "expands", to: "d.md" },
                    { type: "example", to: "e.md" },
                    { type: "implements", to: "f.md" },
                ],
            },
            { start: "a.md", steps: [{ type: "expands", to: "c.md" }] },
        ]);
    });

    it("never includes an excluded-type edge (contradicts/question/link) in any step", () => {
        const steps = reasoningPaths(model, "a.md").flatMap((path) => path.steps);
        for (const step of steps) {
            expect(["supports", "expands", "example", "implements"]).toContain(step.type);
        }
    });

    it("caps a chain longer than maxDepth (default 5) to 5 steps", () => {
        expect(reasoningPaths(model, "p1.md")).toEqual([
            {
                start: "p1.md",
                steps: [
                    { type: "supports", to: "p2.md" },
                    { type: "supports", to: "p3.md" },
                    { type: "supports", to: "p4.md" },
                    { type: "supports", to: "p5.md" },
                    { type: "supports", to: "p6.md" },
                ],
            },
        ]);
    });

    it("honours a custom maxDepth", () => {
        expect(reasoningPaths(model, "p1.md", { maxDepth: 2 })).toEqual([
            {
                start: "p1.md",
                steps: [
                    { type: "supports", to: "p2.md" },
                    { type: "supports", to: "p3.md" },
                ],
            },
        ]);
    });

    it("returns [] for a start with no outgoing forward edge, an unknown start, and an empty model", () => {
        expect(reasoningPaths(model, "c.md")).toEqual([]);
        expect(reasoningPaths(model, "missing.md")).toEqual([]);
        expect(reasoningPaths(buildModel([]), "a.md")).toEqual([]);
    });

    it("is deterministic and read-only", () => {
        const before = model.size();
        expect(reasoningPaths(model, "a.md")).toEqual(reasoningPaths(model, "a.md"));
        expect(model.size()).toBe(before);
    });
});
