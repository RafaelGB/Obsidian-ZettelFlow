import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const STYLES = join(__dirname, "..", "..", "src", "styles", "components");

/**
 * The 3D graph paints its own world — a scene with its own palette, over a canvas rather than
 * over your theme's surfaces. It is the one place a fixed colour is the right answer, and it is
 * named here rather than quietly skipped.
 */
const OWN_PALETTE = ["graph3d.scss"];

/**
 * A colour literal used as a value.
 *
 * Two things are deliberately not caught. `var(--x, #ccc)` is a **fallback**, not a choice. And
 * `rgba(0, 0, 0, …)` in a `box-shadow` is a shadow — dark under every theme, and what Obsidian's
 * own CSS does. The bug this guards is a **surface or a text colour** the theme did not pick.
 */
function hardcodedColours(source: string): string[] {
    const withoutComments = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
    return withoutComments
        .split("\n")
        .filter((line) => /:\s*[^;]*#[0-9a-fA-F]{3,8}\b/.test(line))
        .filter((line) => !/var\(--[^,]+,\s*#/.test(line))
        .map((line) => line.trim());
}

/**
 * A surface paints with the theme, not against it (#472 follow-up).
 *
 * Cultivate's target card and Home's two teasers were painted with hardcoded greens and blues —
 * `#1d3a2b`, `#e8f2ec`, `#22305a`. On a dark theme they merely looked out of place; on a light
 * one they were a dark rectangle in the middle of the page, with text the theme never chose.
 *
 * That, more than the flatness, is what made those surfaces feel like somebody else's software.
 * Obsidian gives every colour a variable, and a plugin that ignores them is a plugin that cannot
 * follow a theme the user picked.
 */
describe("a surface paints with the theme, not against it", () => {
    const sheets = readdirSync(STYLES).filter((name) => name.endsWith(".scss"));

    it("reads every stylesheet, not a corner of them", () => {
        expect(sheets.length).toBeGreaterThan(30);
    });

    it("uses no hardcoded colour outside the one surface with its own palette", () => {
        const offenders = sheets
            .filter((name) => !OWN_PALETTE.includes(name))
            .flatMap((name) =>
                hardcodedColours(readFileSync(join(STYLES, name), "utf8")).map(
                    (line) => `${name}: ${line}`
                )
            );
        expect(offenders).toEqual([]);
    });

    it("still allows a fallback inside a var(), which is not a choice of colour", () => {
        expect(hardcodedColours("color: var(--accent-color, #007bff);")).toEqual([]);
        expect(hardcodedColours("color: #007bff;")).toHaveLength(1);
    });

    it("does not count an issue number in a comment as a colour", () => {
        // `#338` reads like a three-digit hex, which is why the scan strips comments first.
        expect(hardcodedColours("/* a note about #338 */\ncolor: var(--text-normal);")).toEqual([]);
    });
});
