import { describe, it, expect } from "@jest/globals";
import { focusPlan } from "architecture/components/core/noteCompanion/companionFocus";

describe("where a deep-linked focus lands (#640 FR-21/22, AC-9)", () => {
    it("expands and scrolls to a section that has something in it", () => {
        expect(focusPlan("nearby", ["nearby", "gaps"])).toEqual({ expand: "nearby", scrollTo: "section" });
        expect(focusPlan("gaps", ["gaps"])).toEqual({ expand: "gaps", scrollTo: "section" });
    });

    it("scrolls to the folded line when the section is empty", () => {
        expect(focusPlan("gaps", ["tension"])).toEqual({ expand: null, scrollTo: "folded" });
    });

    it("leaves the next step to the block that owns it", () => {
        expect(focusPlan("next", ["gaps"])).toBeNull();
    });
});
