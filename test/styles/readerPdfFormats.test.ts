import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const READER = readFileSync(join(__dirname, "..", "..", "src", "styles", "components", "reader.scss"), "utf8");
const start = READER.indexOf("/* ── A PDF's formats (epic #836)");
const section = READER.slice(start, READER.indexOf("\n/* ", start + 10));
const rule = (selector: string) => {
    const at = section.indexOf(`${selector} {`);
    return at < 0 ? "" : section.slice(at, section.indexOf("}", at));
};

/** A PDF's formats are drawn by the stylesheet, in the theme's own terms (epic #836, §XV). */
describe("a PDF's formats, in the stylesheet (#836)", () => {
    it("has its own section, in the theme's terms: no colour of its own, no pixel", () => {
        expect(start).toBeGreaterThan(0);
        const rules = section.replace(/\/\*[\s\S]*?\*\//g, "");
        expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i);
        expect(rules).not.toMatch(/\d+px/);
    });

    it("never draws a list's marker itself: the page's own is the only one (#838 AC-2)", () => {
        expect(rule(".zettelkasten-flow__reader-pdf-list")).toContain("list-style: none;");
    });

    it("hangs an item's marker in the margin, its words and what is under it in a column (#838 AC-8)", () => {
        const item = rule(".zettelkasten-flow__reader-pdf-item");
        expect(item).toContain("display: grid;");
        expect(item).toContain("grid-template-columns: max-content 1fr;");
        expect(section).toMatch(/> :not\(\.zettelkasten-flow__reader-pdf-marker\) \{\s*grid-column: 2;/);
    });
});

describe("footnotes, in the stylesheet (#840)", () => {
    it("never lets a raised marker open its line (AC-M2)", () => {
        expect(rule("sup")).toContain("line-height: 0;");
    });

    it("sets a footnote small, in the Reader's own muted ink, the first apart from the text (AC-12)", () => {
        const note = rule(".zettelkasten-flow__reader-pdf-footnote");
        expect(note).toContain("font-size: var(--font-smaller);");
        expect(note).toContain("color: var(--reader-muted);");
        expect(rule(":not(.zettelkasten-flow__reader-pdf-footnote) + .zettelkasten-flow__reader-pdf-footnote")).toContain("border-top: var(--border-width) solid var(--reader-line);");
    });
});

describe("a footnote opened at its mark stays inside the Reader (#840, walked in Obsidian 1.14.4)", () => {
    it("clamps the pop's centre to half its width from either edge", () => {
        const at = READER.indexOf(".zettelkasten-flow__reader-note-pop {");
        const pop = READER.slice(at, READER.indexOf("}", at));
        expect(pop).toContain("left: clamp(calc(min(13rem, 50% - var(--size-4-4)) + var(--size-4-4)), var(--zf-note-x, 50%), calc(100% - min(13rem, 50% - var(--size-4-4)) - var(--size-4-4)));");
        expect(pop).toContain("width: min(26rem, calc(100% - var(--size-4-8)));");
    });
});
