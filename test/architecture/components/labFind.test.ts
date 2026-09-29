import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const SRC = join(__dirname, "..", "..", "..", "src");
const LAB = readFileSync(join(SRC, "architecture", "components", "core", "lab", "LabRenderer.ts"), "utf8");
const SCSS = readFileSync(join(SRC, "styles", "components", "lab.scss"), "utf8");

/**
 * One always-on find bar, and only one (#596, AC-4 / AC-9).
 *
 * The old filter appeared only past eight thoughts and searched the body alone; the find bar is now
 * always there, searches body + tags + subject (labSearch), and the card tag chips feed the *same*
 * active-tags the bar reads — there is no second, standalone tag-filter widget.
 */
describe("the find bar is always on, and there is only one (#596, AC-4/AC-9)", () => {
    it("removed the eight-thought gate", () => {
        expect(LAB).not.toContain("FILTER_APPEARS_AT");
    });

    it("always renders one find bar, not a gated filter", () => {
        expect(LAB).toContain("private renderFindBar(");
        expect(LAB).not.toContain("private renderFilter(");
        expect(LAB).toMatch(/this\.renderFindBar\(host\);/);
    });

    it("uses one filter model — card tag chips feed the same active-tags the find bar reads", () => {
        expect(LAB).toContain("this.toggleTag(tag)"); // a card chip toggles the shared filter
        expect(LAB).toContain("this.activeTags"); // which the find bar and query() read
        expect(LAB).not.toContain("renderTagFilter"); // no second standalone widget
    });

    it("draws its tag chips with the shared chip mixin, not a hand-rolled shape", () => {
        const rule = SCSS.slice(SCSS.indexOf(".zettelkasten-flow__lab-tag-chip"));
        expect(rule.slice(0, 200)).toContain("@include chip");
    });
});
