import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

// test/zettelkasten/modals → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const MODAL = readFileSync(
    join(ROOT, "src", "zettelkasten", "modals", "ConditionEditorModal.ts"),
    "utf8"
);

/**
 * Guided-builder surface wiring (#235, #318 S5). The condition modal must offer the pickers-based
 * composer (not just a code box): it uses the pure {@link buildConditionExpression} + operator
 * vocabulary, and pushes the composed expression into the live editor so the user sees valid JS appear.
 */
describe("condition builder surface (#318 S5)", () => {
    it("renders the guided field/operator/value composer from the pure builder", () => {
        expect(MODAL).toContain('from "architecture/plugin/events/conditionBuilder"');
        expect(MODAL).toContain("buildConditionExpression(");
        expect(MODAL).toContain("CONDITION_OPERATORS");
        expect(MODAL).toContain("renderBuilder(");
    });

    it("pushes composed/inserted text into the CodeMirror editor (not just the save buffer)", () => {
        expect(MODAL).toContain("view.dispatch(");
        expect(MODAL).toMatch(/setExpr\(/);
    });
});
