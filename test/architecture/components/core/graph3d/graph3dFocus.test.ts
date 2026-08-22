import { describe, it, expect } from "@jest/globals";
import { requestGraph3DFocus, consumeGraph3DFocus } from "architecture/components/core/graph3d/graph3dFocus";

/** #280 S3 — the deep-link handoff is consume-once: the renderer flies to the requested note exactly once. */
describe("graph3dFocus handoff (#280 S3)", () => {
    it("returns null when nothing is requested", () => {
        consumeGraph3DFocus(); // clear any residue
        expect(consumeGraph3DFocus()).toBeNull();
    });

    it("hands off a requested path exactly once", () => {
        requestGraph3DFocus("Notes/Idea.md");
        expect(consumeGraph3DFocus()).toBe("Notes/Idea.md");
        expect(consumeGraph3DFocus()).toBeNull();
    });

    it("treats a blank request as no request", () => {
        requestGraph3DFocus("");
        expect(consumeGraph3DFocus()).toBeNull();
    });
});
