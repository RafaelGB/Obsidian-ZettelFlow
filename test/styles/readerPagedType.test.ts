import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const SCSS = readFileSync(join(__dirname, "..", "..", "src", "styles", "components", "reader.scss"), "utf8");

/** **No line alone at a page's foot or head** (#809 D1): the paged body keeps two lines together. */
describe("whole paragraphs in pages (#809 D1)", () => {
    it("declares widows and orphans of two in the paged body", () => {
        const paged = SCSS.slice(SCSS.indexOf(".zettelkasten-flow__reader--layout-page,"));
        const block = paged.slice(0, paged.indexOf("/* A spread has no room for the margin"));
        expect(block).toMatch(/widows:\s*2;/);
        expect(block).toMatch(/orphans:\s*2;/);
    });

    it("probes hyphenation off-screen with classes, never an inline style (#809 FR-1)", () => {
        expect(SCSS).toMatch(/\.zettelkasten-flow__reader-hyphen-probe\s*\{[^}]*hyphens:\s*auto;/);
        expect(SCSS).toMatch(/\.zettelkasten-flow__reader-hyphen-probe--manual\s*\{[^}]*hyphens:\s*manual;/);
    });
});
