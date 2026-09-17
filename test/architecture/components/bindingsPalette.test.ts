import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import {
    SCRIPT_ACTION_BINDINGS,
    DYNAMIC_SELECTOR_BINDINGS,
    HOOK_BINDINGS,
    CONDITION_BINDINGS,
    bindingNames,
} from "architecture/api";

const ROOT = join(__dirname, "..", "..", "..");
const PALETTE = readFileSync(
    join(ROOT, "src", "architecture", "components", "core", "codeView", "editor", "BindingsPalette.ts"),
    "utf8"
);
const CODE_VIEW = readFileSync(
    join(ROOT, "src", "architecture", "components", "core", "codeView", "CodeView.ts"),
    "utf8"
);

/**
 * The palette says what a surface hands your script (#449) — and it says it from the contract the
 * runtime injects from (#349), never from a list of its own that could drift.
 */
describe("the editor tells you what you have (#449)", () => {
    it("renders whatever bindings it is given, rather than a table of its own", () => {
        expect(PALETTE).toContain("bindings: readonly ScriptBinding[]");
        for (const surface of [
            SCRIPT_ACTION_BINDINGS,
            DYNAMIC_SELECTOR_BINDINGS,
            HOOK_BINDINGS,
            CONDITION_BINDINGS,
        ]) {
            // Every contract is non-empty, so a palette is always worth showing.
            expect(bindingNames(surface).length).toBeGreaterThan(0);
        }
    });

    it("inserts at the cursor and gives the editor its focus back", () => {
        expect(PALETTE).toContain("selection: { anchor: at + binding.name.length }");
        expect(PALETTE).toContain("editor.focus()");
    });

    it("leaves no dead affordance behind in the code view", () => {
        expect(CODE_VIEW).not.toContain("TODO");
        expect(CODE_VIEW).toContain("openWorkbench");
    });
});
