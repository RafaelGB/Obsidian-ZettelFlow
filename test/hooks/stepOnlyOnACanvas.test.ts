import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const FILE_MENU = read("src/hooks/FileMenu.ts");

/**
 * **A note becomes a step on a canvas, nowhere else** (#519).
 *
 * The three-dot menu on every markdown file offered "Transform note into step" — noise on almost
 * every note, and misleading on all of them: a step only means something inside a flow canvas, so
 * the item opened the step builder for a note no flow references.
 *
 * The same rule caught a second door. "Paste step configuration" showed whenever the canvas
 * clipboard was non-empty, and on a note that is not a step it created one from the file explorer.
 * Both go; editing, copying and removing stay, because those act on a note that already **is** a
 * step.
 */

function code(source: string): string {
    return source
        .split("\n")
        .filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
        })
        .join("\n");
}

describe("the file menu cannot make a step (#519)", () => {
    it("no longer offers to transform a note into one", () => {
        expect(code(FILE_MENU)).not.toContain("menu_pane_transform_note_into_step");
    });

    it("and the string it used is gone from both locales", () => {
        for (const [name, locale] of [["en", en], ["es", es]] as const) {
            expect({ name, present: "menu_pane_transform_note_into_step" in locale }).toEqual({
                name,
                present: false,
            });
        }
    });

    it("leaves before adding anything when the note is not a step", () => {
        // The gate is one early return, so a note that is not a step gets no ZettelFlow items at
        // all — not a shorter list, none.
        expect(code(FILE_MENU)).toMatch(/if \(!fileService\.hasZettelFlowSettings\(\)\) return;/);
    });

    it("stops offering the paste that was a transform under another name", () => {
        // Pasting onto a note with no step settings creates a step from the file explorer, which
        // is the thing this issue removes. Inside the gate it can only replace one.
        const markdown = code(FILE_MENU);
        const gate = markdown.indexOf("hasZettelFlowSettings()) return;");
        expect(gate).toBeGreaterThan(-1);
        expect(markdown.indexOf("menu_pane_paste_step_configuration")).toBeGreaterThan(gate);
    });
});

describe("what a note that is already a step keeps (#519)", () => {
    it("can still be edited, copied and cleared from its own menu", () => {
        // The canvas is not always open, and editing a step from the note it lives in is the
        // in-context door.
        for (const key of ["menu_pane_edit_step", "menu_pane_copy_step_configuration", "menu_pane_remove_step_configuration"]) {
            expect(code(FILE_MENU)).toContain(key);
        }
    });
});

describe("the canvas doors are untouched (#519)", () => {
    it("still open the step builder", () => {
        // This issue removes a door, not a capability. If these ever stop opening the builder, a
        // note could no longer be made into a step at all, which is a different and much worse bug.
        expect(read("src/hooks/CanvasNodeMenu.ts")).toContain("new StepBuilderModal(");
        expect(read("src/architecture/plugin/canvas/extensions/EditCanvasExtension.ts")).toContain("new StepBuilderModal(");
    });
});
