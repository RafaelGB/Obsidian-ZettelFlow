import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const SCSS = readFileSync(join(__dirname, "..", "..", "src", "styles", "components", "reader.scss"), "utf8");

/** The body of the first top-level rule whose selector is exactly `selector` — to its own closing brace, not an interpolation's. */
function rule(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^]*?)\\n\\}`).exec(SCSS);
    if (!match) throw new Error(`no rule for ${selector}`);
    return match[1];
}

/** A side of the safe area, as the stylesheet reads it: env() itself, or the variable defined from it. */
const side = (name: "top" | "bottom" | "left" | "right") => new RegExp(`env\\(safe-area-inset-${name}\\)|\\$safe-${name}\\b`);

/**
 * **Inside the safe area** (#750 FR-9, AC-7): on an iPad the status bar, the home indicator and, in
 * landscape on a phone, the notch take part of the screen. Every fixed piece of the Reader's chrome
 * honours the matching inset, in both orientations and in a Split View window.
 */
describe("the Reader's chrome sits inside the safe area (#750)", () => {
    it("reads the insets from Obsidian's own variables, falling back to env()", () => {
        for (const name of ["top", "bottom", "left", "right"]) {
            expect(SCSS).toContain(`$safe-${name}: var(--safe-area-inset-${name}, env(safe-area-inset-${name}));`);
        }
    });

    it("keeps the top line and the back pill below the status bar", () => {
        expect(rule(".zettelkasten-flow__reader-top")).toMatch(side("top"));
        expect(rule(".zettelkasten-flow__reader-top")).toMatch(side("left"));
        expect(rule(".zettelkasten-flow__reader-top")).toMatch(side("right"));
        expect(rule(".zettelkasten-flow__reader-detour-pill")).toMatch(side("top"));
    });

    it("keeps the dots, the bar and the sheet above the home indicator and clear of the sides", () => {
        for (const selector of [".zettelkasten-flow__reader-dots", ".zettelkasten-flow__reader-bar", ".zettelkasten-flow__reader-panel.zettelkasten-flow__reader-panel--sheet"]) {
            const body = rule(selector);
            expect({ selector, bottom: side("bottom").test(body), left: side("left").test(body), right: side("right").test(body) }).toEqual({ selector, bottom: true, left: true, right: true });
        }
    });

    it("lays the stage — and the sheet a turn lifts off it — inside all four", () => {
        expect(rule(".zettelkasten-flow__reader-stage")).toContain("inset: $stage-inset");
        expect(SCSS).toMatch(/\.zettelkasten-flow__turn-underlay\s*\{\s*position: absolute;\s*inset: \$stage-inset;/);
        const inset = /\$stage-inset: ([^;]+);/.exec(SCSS)?.[1] ?? "";
        for (const name of ["top", "bottom", "left", "right"] as const) expect(inset).toMatch(side(name));
    });
});
