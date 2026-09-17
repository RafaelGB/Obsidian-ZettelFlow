import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { SkipStepError } from "application/scripts/SkipStepError";
import { applyErrorPolicy } from "application/scripts/errorPolicy";

const ROOT = join(__dirname, "..", "..", "..");
const BUILDER = readFileSync(join(ROOT, "src", "application", "notes", "NoteBuilder.ts"), "utf8");
const ACTION = readFileSync(join(ROOT, "src", "actions", "script", "scriptActionCore.ts"), "utf8");

/**
 * *Skip* and *stop* are the two policies that change what happens around a failing script (#445),
 * so they are the two worth pinning to the code that honours them.
 */
describe("a script can abandon its step, or the whole note (#445)", () => {
    it("carries the step it belongs to, so the builder knows how much to skip", () => {
        const error = new SkipStepError("boom", "step-7");
        expect(error.stepId).toBe("step-7");
        expect(error).toBeInstanceOf(Error);
    });

    it("has the builder skip the remaining elements of that step, and only those", () => {
        // The loop keeps skipping while the elements come from the same node, then resumes.
        expect(BUILDER).toContain("skipping !== undefined && element.stepId === skipping");
        expect(BUILDER).toContain("SkipStepError");
    });

    it("has the action raise the right signal for each policy", () => {
        expect(ACTION).toContain("outcome.stopBuild");
        expect(ACTION).toContain("new FatalError(");
        expect(ACTION).toContain("outcome.skipStep");
        expect(ACTION).toContain("new SkipStepError(");
    });

    it("stops the build only for stop, and skips only for skip", () => {
        expect(applyErrorPolicy("stop")).toMatchObject({ stopBuild: true, skipStep: false });
        expect(applyErrorPolicy("skip")).toMatchObject({ stopBuild: false, skipStep: true });
        expect(applyErrorPolicy("notify")).toMatchObject({ stopBuild: false, skipStep: false });
    });

    it("lets a raised signal travel instead of catching it again", () => {
        expect(ACTION).toContain("if (error instanceof SkipStepError || error instanceof FatalError) throw error;");
    });
});
