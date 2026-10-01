import { describe, it, expect } from "@jest/globals";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * **The dashboard fills the pane** (#620).
 *
 * The complaint was concrete: collapse Obsidian's side panels and the Home surface's modes stayed
 * pinned to a narrow centred column — `.cultivate` at 44rem, `.inquiry` at 52rem, `.lab` at 780px,
 * each with `margin: 0 auto` — wasting the width they were just given. The shared `.surface-body`
 * was already full-width; the cage was each mode's own root.
 *
 * This guards the shape of the fix as source text (the repo's established SCSS-as-string pattern):
 * the cages are gone, and a fluid `auto-fit` grid takes their place so the columns follow the pane
 * (one when docked, two or three when wide) with no breakpoint and no script. The live reflow
 * across real leaf widths is a manual step in the issue's verification script — jest cannot measure
 * layout.
 */
const STYLES = join(__dirname, "..", "..", "src", "styles");
const COMPONENTS = join(STYLES, "components");
const read = (name: string): string => readFileSync(join(COMPONENTS, name), "utf8");

describe("the dashboard fills the pane instead of a narrow centred column (#620)", () => {
    it("ships a dashboard primitives partial with a fluid auto-fit grid", () => {
        const path = join(COMPONENTS, "dashboard.scss");
        expect(existsSync(path)).toBe(true);
        const css = readFileSync(path, "utf8");
        // auto-fit columns that never fall below a readable card width
        expect(css).toMatch(/grid-template-columns:\s*repeat\(\s*auto-fit\s*,\s*minmax\(/);
        // a generous outer cap in rem, never a pixel cage
        expect(css).toMatch(/max-width:\s*\d+rem/);
        expect(css).not.toContain("780px");
    });

    it("registers the dashboard partial in the main stylesheet", () => {
        const main = readFileSync(join(STYLES, "main.scss"), "utf8");
        expect(main).toContain("components/dashboard.scss");
    });

    it("drops the narrow centred cages from Cultivate, Inquiry and the Lab", () => {
        const cultivate = read("cultivate.scss");
        expect(cultivate).not.toMatch(/max-width:\s*44rem/);
        expect(cultivate).not.toMatch(/max-width:\s*52rem/);

        const lab = read("lab.scss");
        expect(lab).not.toMatch(/max-width:\s*780px/);
    });

    it("lays the Cultivate moves out as a fluid grid, not a tall column (#620)", () => {
        const cultivate = read("cultivate.scss");
        const moves = cultivate.slice(cultivate.indexOf(".zettelkasten-flow__cultivate-moves"));
        expect(moves).toMatch(/grid-template-columns:\s*repeat\(\s*auto-fit\s*,\s*minmax\(/);
    });

    it("reflows the Lab thread list into a grid that keeps newest-first order (#620, decision #2)", () => {
        const lab = read("lab.scss");
        const list = lab.slice(lab.indexOf(".zettelkasten-flow__lab-list"), lab.indexOf(".zettelkasten-flow__lab-card"));
        expect(list).toMatch(/grid-template-columns:\s*repeat\(\s*auto-fit\s*,\s*minmax\(/);
        // CSS grid, not CSS `columns` — columns fill top-to-bottom and reorder a time-ordered list.
        expect(list).toMatch(/align-items:\s*start/);
        expect(list).not.toMatch(/^\s*columns:\s*\d/m);
    });
});
