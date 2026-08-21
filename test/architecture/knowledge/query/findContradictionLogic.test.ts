import { describe, it, expect } from "@jest/globals";
import { findContradictions } from "architecture/knowledge/query/findContradictionLogic";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

const model = buildModel([
    // a ↔ b mutual contradiction (dedup), c contradicts a, d *supports* a (must be ignored)
    idea("a.md", "permanent", [{ to: "b.md", type: "contradicts" }]),
    idea("b.md", "permanent", [{ to: "a.md", type: "contradicts" }]),
    idea("c.md", "permanent", [{ to: "a.md", type: "contradicts" }]),
    idea("d.md", "permanent", [{ to: "a.md", type: "supports" }]),
    idea("lonely.md", "permanent", []),
]);

describe("findContradictions (#153, FR-S3, AC-1)", () => {
    it("returns outgoing and incoming contradicts partners, deduped", () => {
        expect(findContradictions(model, "a.md")).toEqual(["b.md", "c.md"]);
    });

    it("ignores non-contradicts relations (a supports edge is not a contradiction)", () => {
        expect(findContradictions(model, "a.md")).not.toContain("d.md");
    });

    it("returns an empty list when there is no contradicts edge", () => {
        expect(findContradictions(model, "lonely.md")).toEqual([]);
    });
});
