import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { asFirstStep } from "architecture/plugin/canvas/extensions/utils/firstStep";

const EXTENSION = readFileSync(
    join(__dirname, "..", "..", "..", "..", "src", "architecture", "plugin", "canvas", "extensions", "AddManagedStepExtension.ts"),
    "utf8"
);

/** A flow with one step has one place to start: the empty canvas's first step starts it. */
describe("the first step of an empty flow starts it", () => {
    const blank = { root: false, actions: [], label: "" };

    it("marks the first step as the one the wizard offers first", () => {
        expect(asFirstStep(blank, true).root).toBe(true);
    });

    it("leaves any later step as it was", () => {
        expect(asFirstStep(blank, false)).toBe(blank);
    });

    it("keeps everything else an installed template brings", () => {
        const template = { root: false, actions: [{ type: "prompt" }], label: "Capture", targetFolder: "Inbox" };
        expect(asFirstStep(template as never, true)).toEqual({ ...template, root: true });
    });

    it("is what the empty canvas's Create the first step does — and only that door", () => {
        expect(EXTENSION).toContain("GROUP_NODE_SIZE), true);");
        expect(EXTENSION).toContain("asFirstStep(step, first)");
        expect(EXTENSION).toContain("(canvas: Canvas, pos: Position) => this.handleManagedStepCreation(canvas, pos)");
    });
});
