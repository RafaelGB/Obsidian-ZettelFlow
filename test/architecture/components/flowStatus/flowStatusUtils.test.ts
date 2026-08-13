import { describe, it, expect } from "@jest/globals";
import { formatFlowStatus } from "architecture/components/core/flowStatus/flowStatusUtils";

describe("formatFlowStatus", () => {
    it("returns empty string when both are empty", () => {
        expect(formatFlowStatus("", "")).toBe("");
    });

    it("returns step name alone when canvas is empty", () => {
        expect(formatFlowStatus("", "Step 1")).toBe("Step 1");
    });

    it("returns canvas alone when step is empty", () => {
        expect(formatFlowStatus("MyCanvas", "")).toBe("MyCanvas");
    });

    it("returns 'canvas › step' when both are set", () => {
        expect(formatFlowStatus("MyCanvas", "Intro")).toBe("MyCanvas › Intro");
    });
});
