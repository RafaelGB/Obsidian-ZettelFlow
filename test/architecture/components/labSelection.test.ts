import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const SRC = join(__dirname, "..", "..", "..", "src");
const LAB = readFileSync(join(SRC, "architecture", "components", "core", "lab", "LabRenderer.ts"), "utf8");
const SCSS = readFileSync(join(SRC, "styles", "components", "lab.scss"), "utf8");

/**
 * A picked thought stays visibly picked (#596).
 *
 * Selection lived only in the `lab-pick` checkbox inside `.lab-actions`, which is `opacity: 0` until
 * you hover — so a selected card looked unselected the moment the pointer left. The cue must be a
 * persistent card class, not a hover rule.
 */
describe("a picked thought stays visibly picked (#596)", () => {
    it("marks the card with lab-selected, driven by the selection set", () => {
        expect(LAB).toContain('if (this.selected.has(thought.id)) box.addClass(c("lab-selected"))');
    });

    it("styles lab-selected persistently, not under :hover/:focus-within", () => {
        const start = SCSS.indexOf(".zettelkasten-flow__lab-selected");
        expect(start).toBeGreaterThan(-1);
        // The rule has one nested block (`.lab-actions`), so its close is the second `}` after start.
        const rule = SCSS.slice(start, SCSS.indexOf("}", SCSS.indexOf("}", start) + 1) + 1);
        expect(rule).not.toMatch(/:hover|:focus-within/);
        // and it keeps the action row — with the checked pick — visible while selected
        expect(rule).toContain(".zettelkasten-flow__lab-actions");
        expect(rule).toContain("opacity: 1");
    });
});
