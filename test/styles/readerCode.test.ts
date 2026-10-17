import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const STYLES = join(__dirname, "..", "..", "src", "styles");
const READER = readFileSync(join(STYLES, "components", "reader.scss"), "utf8");
const MIXINS = readFileSync(join(STYLES, "utils", "mixins.scss"), "utf8");
const section = READER.slice(READER.indexOf("/* ── Code in a book (#824)"));
const rule = (selector: string) => {
    const at = section.indexOf(`${selector} {`);
    return at < 0 ? "" : section.slice(at, section.indexOf("}", at));
};

/** Code in a book is drawn by the stylesheet, from the theme (#824 FR-3–FR-5, FR-7; AC-4, AC-6, AC-7, AC-9). */
describe("code in a book, in the stylesheet (#824)", () => {
    it("lets the runs scroll, never the listing — so a listing pages like a book", () => {
        expect(rule("pre.zettelkasten-flow__reader-code")).toContain("overflow: visible;");
        const run = rule(".zettelkasten-flow__reader-code-run");
        for (const declaration of ["overflow-x: auto;", "max-width: 100%;", "overscroll-behavior-x: contain;", "break-inside: avoid;", "touch-action: pan-x pan-y;"]) {
            expect({ declaration, present: run.includes(declaration) }).toEqual({ declaration, present: true });
        }
    });

    it("marks a run that continues with the Reader's own word, never the book's", () => {
        expect(rule(".zettelkasten-flow__reader-code-run[data-zf-continues]::after")).toContain("content: attr(data-zf-continues)");
    });

    it("keeps inline code, keys, samples and variables inside the line", () => {
        expect(section).toMatch(/code,\s*kbd,\s*samp,\s*var \{\s*line-height: 1;/);
        expect(section).toMatch(/\n {4}var \{\s*font-family: var\(--font-monospace\);\s*font-style: italic;/);
        expect(rule("kbd")).toContain("@include key-cap;");
    });

    it("hangs a wrapped line under its own indent", () => {
        const wrap = section.slice(section.indexOf(".zettelkasten-flow__reader--code-wrap"));
        expect(wrap).toContain("white-space: pre-wrap;");
        expect(wrap).toContain("padding-inline-start: calc((var(--zf-indent, 0) + 2) * 1ch);");
        expect(wrap).toContain("text-indent: calc((var(--zf-indent, 0) + 2) * -1ch);");
    });

    it("re-derives every token colour for the Reader's own looks, from the theme's palette", () => {
        const palette = MIXINS.slice(MIXINS.indexOf("@mixin reader-theme-palette"));
        for (const name of ["background", "normal", "comment", "function", "important", "keyword", "operator", "property", "punctuation", "string", "tag", "value"]) {
            expect({ name, present: palette.includes(`--code-${name}: var(--`) }).toEqual({ name, present: true });
        }
    });

    it("draws a key the same way in the shortcuts panel and in a book", () => {
        expect(MIXINS).toContain("@mixin key-cap");
        expect(READER.match(/@include key-cap;/g)?.length).toBe(2);
    });
});

describe("the strip's place is not inherited, and a printed page's crop still is (#826)", () => {
    it("registers the pager's own property, and never the crop's", () => {
        expect(READER).toMatch(/@property --zf-strip-x \{\s*syntax: "<length>";\s*inherits: false;/);
        expect(READER).not.toMatch(/@property --zf-page-x/);
        expect(READER).toContain("translate: var(--zf-strip-x, 0) 0;");
    });
});
