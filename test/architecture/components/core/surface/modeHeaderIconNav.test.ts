import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * **A fixed icon door, without a second primary** (#620).
 *
 * Home needed a permanent way to reach *Ask your graph* — a control where you already are, not a
 * command (the palette is a re-entry point, never a discovery path). It cannot be a second
 * `primary()` (one per header, #577), and it should not spend a word of header width on a label.
 *
 * So `nav()` grew an `iconOnly` variant: a single glyph whose name lives in the tooltip and the
 * `aria-label`, so it is still reachable by a screen reader and still named on hover. Asserted on
 * the source — the repo's renderer tests read `.ts` as text (there is no DOM here).
 */
const SRC = readFileSync(
    join(__dirname, "..", "..", "..", "..", "..", "src", "architecture", "components", "core", "surface", "ModeHeader.ts"),
    "utf8"
);

describe("ModeHeader carries an icon-only nav door (#620)", () => {
    it("still imports setTooltip from Obsidian", () => {
        expect(SRC).toMatch(/import\s*\{[^}]*\bsetTooltip\b[^}]*\}\s*from\s*"obsidian"/);
    });

    it("lets nav take an iconOnly flag", () => {
        expect(SRC).toMatch(/nav\(\s*action:[^)]*iconOnly/);
    });

    it("draws an icon-only nav as a glyph with a tooltip, never a visible label span", () => {
        const start = SRC.indexOf("nav(action:");
        const body = SRC.slice(start, SRC.indexOf("secondary(", start));
        expect(body).toContain("iconOnly");
        // The name survives as a tooltip + aria-label rather than a text span.
        expect(body).toContain("setTooltip(");
        // Obsidian's own icon-button affordance, not a new one.
        expect(body).toContain("clickable-icon");
    });
});
