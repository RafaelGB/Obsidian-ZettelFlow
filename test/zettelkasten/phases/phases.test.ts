import { describe, it, expect } from "@jest/globals";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
    STEP_PHASES,
    isStepPhase,
    PHASE_LABEL_KEY,
    PHASE_DESCRIPTION_KEY,
} from "zettelkasten/phases";

describe("step phase vocabulary (#149)", () => {
    it("STEP_PHASES lists the seven phases in canonical order (AC-4)", () => {
        expect(STEP_PHASES).toEqual([
            "CAPTURE",
            "CLASSIFY",
            "PROCESS",
            "CONNECT",
            "DEVELOP",
            "REVIEW",
            "CONSOLIDATE",
        ]);
    });

    it("isStepPhase accepts the seven tokens and rejects anything else", () => {
        for (const phase of STEP_PHASES) expect(isStepPhase(phase)).toBe(true);
        for (const junk of ["capture", "", "FOO", undefined, null, 3, {}]) {
            expect(isStepPhase(junk as unknown)).toBe(false);
        }
    });

    it("has a label and description i18n key for every phase", () => {
        for (const phase of STEP_PHASES) {
            expect(typeof PHASE_LABEL_KEY[phase]).toBe("string");
            expect(typeof PHASE_DESCRIPTION_KEY[phase]).toBe("string");
        }
    });

    it("the phases module imports nothing from obsidian (pure)", () => {
        const dir = join(__dirname, "..", "..", "..", "src", "zettelkasten", "phases");
        const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
            expect(readFileSync(join(dir, file), "utf8")).not.toMatch(/from\s+["']obsidian["']/);
        }
    });
});
