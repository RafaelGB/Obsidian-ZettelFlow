import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const SCSS = readFileSync(join(__dirname, "..", "..", "src", "styles", "components", "reader.scss"), "utf8").replace(/\r\n/g, "\n");

/** **One drawer** (#812): the column, the bar and the dots move together, on the compositor. */
describe("one drawer beside the column (#812)", () => {
    it("defines the shift as half the room the drawer takes — the same terms as the column's inset (AC-8)", () => {
        expect(SCSS).toContain("--zf-drawer-shift: calc((var(--zf-drawer-w) + var(--size-4-6)) / 2);");
        expect(SCSS).toContain("right: calc(#{$safe-right} + var(--zf-drawer-w) + var(--size-4-6));");
    });

    it("moves the bar and the dots with the column on a wide pane, on translate (FR-9, MF-4)", () => {
        const wide = SCSS.slice(SCSS.indexOf("@container zf-reader (min-width: 52rem) {\n    .zettelkasten-flow__reader--drawer .zettelkasten-flow__reader-stage"));
        const block = wide.slice(0, wide.indexOf("\n}\n"));
        expect(block).toMatch(/\.zettelkasten-flow__reader--drawer \.zettelkasten-flow__reader-bar,\s*\.zettelkasten-flow__reader--drawer \.zettelkasten-flow__reader-dots \{\s*translate: calc\(var\(--zf-drawer-shift\) \* -1\) 0;/);
    });

    it("swaps a panel's content with a short fade, and not at all under reduced motion (MF-3)", () => {
        expect(SCSS).toMatch(/\.zettelkasten-flow__reader-drawer-swap \{\s*animation: zf-reader-drawer-swap \$motion-fast \$ease-out backwards;/);
        const reduced = SCSS.slice(SCSS.lastIndexOf("@media (prefers-reduced-motion: reduce)") - 20000);
        expect(reduced).toMatch(/\.zettelkasten-flow__reader-drawer-swap \{\s*transition: none;\s*animation: none;/);
    });
});
