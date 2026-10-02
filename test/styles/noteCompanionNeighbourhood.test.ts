import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const SCSS = readFileSync(join(__dirname, "..", "..", "src", "styles", "components", "noteNeighbourhood.scss"), "utf8");
const MAIN = readFileSync(join(__dirname, "..", "..", "src", "styles", "main.scss"), "utf8");

/** Every declaration inside the rule for `selector` (first match). */
function rule(selector: string): string {
    const at = SCSS.indexOf(`${selector} {`);
    expect(at).toBeGreaterThan(-1);
    return SCSS.slice(at, SCSS.indexOf("}", at));
}

/**
 * Colour is the relation, and the theme owns the colour (#643 AC-10, §XV): supports green,
 * contradicts red, example blue, anything else faint — each the user's theme variable.
 */
describe("the neighbourhood's colours are the theme's (#643 AC-10)", () => {
    it("is part of the stylesheet", () => {
        expect(MAIN).toContain("@use 'components/noteNeighbourhood.scss';");
    });

    it("draws each relation in the theme's own colour", () => {
        expect(rule(".zettelkasten-flow__note-companion-edge--supports")).toContain("var(--color-green)");
        expect(rule(".zettelkasten-flow__note-companion-edge--contradicts")).toContain("var(--color-red)");
        expect(rule(".zettelkasten-flow__note-companion-edge--example")).toContain("var(--color-blue)");
        expect(rule(".zettelkasten-flow__note-companion-edge")).toContain("var(--text-faint)");
    });

    it("dashes the near ring", () => {
        expect(rule(".zettelkasten-flow__note-companion-edge--near")).toContain("stroke-dasharray");
        expect(rule(".zettelkasten-flow__note-companion-node--near circle")).toContain("stroke-dasharray");
    });

    it("fills its column at any width", () => {
        expect(rule(".zettelkasten-flow__note-companion-graph")).toContain("width: 100%");
        expect(SCSS).toMatch(/@container note-companion \(min-width: 37\.5rem\)/);
    });
});
