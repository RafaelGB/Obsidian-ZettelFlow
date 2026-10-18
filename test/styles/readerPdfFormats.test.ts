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
