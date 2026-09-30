import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * The contributor guide teaches the inline-flow pattern, not the old edges-empty one (#612, AC-9).
 *
 * The systems were rebuilt as drawn, canvas-native flows; the guide used to tell authors to do the
 * opposite — "give each note type its own root and leave the canvas edges empty". A doc that
 * contradicts the shipped reference is worse than no doc, so this pins the reversal.
 */
const DOC = readFileSync(
    join(__dirname, "..", "..", "docs", "how-to-contribute", "systems-gallery.md"),
    "utf8"
);

describe("systems-gallery.md documents the inline-flow pattern (#612)", () => {
    it("no longer tells authors to leave the canvas edges empty", () => {
        expect(DOC).not.toMatch(/leave the canvas \*\*edges empty\*\*/i);
        expect(DOC).not.toMatch(/independent entry points, not a chain/i);
    });

    it("describes the inline-flow reference pattern", () => {
        for (const term of ["zettelflowConfig", "edges", "phase", "StepExit", "inline", "one note"]) {
            expect({ term, present: DOC.includes(term) }).toEqual({ term, present: true });
        }
    });

    it("documents the inline-lint guardrail and the §XII on-creation rule", () => {
        expect(DOC).toContain("lints the inline nodes");
        expect(DOC).toMatch(/suggest-link|suggest-next-move/);
        expect(DOC).toContain("§XII");
    });
});
