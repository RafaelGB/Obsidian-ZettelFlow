import { describe, it, expect } from "@jest/globals";
import { computeIsOrphan } from "actions/detectOrphan/detectOrphanLogic";
import { idea, buildModel } from "./support/knowledgeFixture";

describe("computeIsOrphan (#153, FR-S1, AC-1/AC-7)", () => {
    const model = buildModel([
        idea("orphan.md", "fleeting", []), // no in, no out
        idea("only-out.md", "permanent", [{ to: "target.md" }]), // has outgoing
        idea("target.md", "permanent", []), // has incoming (from only-out + pointer)
        idea("pointer.md", "permanent", [{ to: "only-in.md" }]),
        idea("only-in.md", "permanent", []), // has incoming only
    ]);

    it("is true for a note with no incoming and no outgoing edges", () => {
        expect(computeIsOrphan(model, "orphan.md")).toBe(true);
    });

    it("is false for a note with only outgoing edges", () => {
        expect(computeIsOrphan(model, "only-out.md")).toBe(false);
    });

    it("is false for a note with only incoming edges", () => {
        expect(computeIsOrphan(model, "only-in.md")).toBe(false);
    });

    it("is false for a connected note", () => {
        expect(computeIsOrphan(model, "target.md")).toBe(false);
    });

    it("returns null for a note absent from the model (unindexed / not ready)", () => {
        expect(computeIsOrphan(model, "missing.md")).toBeNull();
    });
});
