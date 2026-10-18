import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { isTypewritten, reflowPage, runOf, suggestPdfView, type PageBlock, type TextRun } from "application/library/pdfText";
import { pageWordsOf } from "application/library/pdfWords";
import { folded, formatsPage, nonSpace } from "../../support/pdfFormats";

/**
 * **The formats a PDF page keeps** (epic #836), over the formats paper: the page's text is today's,
 * character for character outside a listing (FR-1); the formats only cut it and mark it.
 */

/** Today's text and blocks of the formats paper, captured before any format was read (#836). */
const BEFORE: { text: string; blocks: PageBlock[] }[] = JSON.parse(readFileSync(join(__dirname, "..", "..", "fixtures", "pdf", "reflow-before.json"), "utf8"));

const page = (index = 0) => {
    const { items, styles } = formatsPage(index);
    return { items, styles, runs: items.map((item) => runOf(item, styles)) };
};

const joined = (blocks: readonly PageBlock[]) => blocks.map((block) => block.text).join("");
const GEOMETRY = { width: 612, height: 792, toViewport: (rect: number[]) => rect };

describe("the text does not change (#836 FR-1)", () => {
    it("reads the page as it always did when its faces are unknown", () => {
        const { items } = page();
        expect(reflowPage(items.map((item) => runOf(item)))).toEqual(BEFORE[0].blocks);
    });

    it("keeps every character in order, and every space outside a listing", () => {
        const text = joined(reflowPage(page().runs));
        expect(nonSpace(text)).toBe(nonSpace(BEFORE[0].text));
        // The one change: a listing's lines are lines, so its last one starts on its own (#837).
        expect(folded(text)).toBe(folded(BEFORE[0].text).replace("name;}", "name; }"));
    });

    it("leaves the view a PDF suggests where it was (#837 FR-11)", () => {
        const { items } = page();
        expect(suggestPdfView([reflowPage(items.map((item) => runOf(item)))])).toBe(suggestPdfView([BEFORE[0].blocks]));
    });

    it("indexes in Page view the text the Reading view draws", () => {
        const { items, styles, runs } = page();
        expect(pageWordsOf(items, GEOMETRY, { styles }).text).toBe(joined(reflowPage(runs)));
    });
});

describe("code in a PDF keeps its lines (#837)", () => {
    it("reads monospace runs as code, off pdf.js's styles", () => {
        const { runs } = page();
        expect(runs.filter((run) => run.mono).map((run) => run.str)).toEqual(["parseConfig()", "function greet(name) {", "    return 'Hello ' + name;", "}"]);
    });

    it("makes the lines set in monospace one listing, with their indentation (AC-2, AC-3)", () => {
        const blocks = reflowPage(page().runs);
        const listings = blocks.filter((block) => block.kind === "listing");
        expect(listings).toEqual([{ kind: "listing", text: "function greet(name) {\n    return 'Hello ' + name;\n}" }]);
        expect(blocks.some((block) => block.kind === "paragraph" && block.text.includes("greet"))).toBe(false);
        // Today's space before it stays on the paragraph before.
        expect(blocks[blocks.indexOf(listings[0]) - 1].text.endsWith("Another numbered item ")).toBe(true);
    });

    it("indents a line by where it starts, and keeps the spaces inside it as printed (FR-4)", () => {
        const mono = (str: string, x: number, y: number): TextRun => ({ str, x, y, size: 10, width: str.length * 6, mono: true });
        const blocks = reflowPage([mono("if (ready) {", 72, 700), mono("go();", 96, 688), mono("a", 72, 676), mono("=", 90, 676), mono("b", 108, 676)]);
        expect(blocks).toEqual([{ kind: "listing", text: "if (ready) {\n    go();\na  =  b" }]);
    });

    it("keeps one listing through a blank line, and makes two around prose (FR-3)", () => {
        const mono = (str: string, y: number): TextRun => ({ str, x: 72, y, size: 10, width: str.length * 6, mono: true });
        const prose = (str: string, y: number): TextRun => ({ str, x: 72, y, size: 10, width: str.length * 5 });
        expect(reflowPage([mono("a = 1", 700), mono("b = 2", 676)]).map((block) => block.kind)).toEqual(["listing"]);
        const around = reflowPage([mono("a = 1", 700), prose("Then the second step of the method.", 688), mono("b = 2", 676)]);
        expect(around.map((block) => block.kind)).toEqual(["listing", "paragraph", "listing"]);
        expect(nonSpace(joined(around))).toBe("a=1Thenthesecondstepofthemethod.b=2");
    });

    it("marks a monospace name inside a sentence as inline code (FR-5)", () => {
        const paragraph = reflowPage(page().runs).find((block) => block.text.includes("parseConfig()"))!;
        expect(paragraph.kind).toBe("paragraph");
        expect(paragraph.spans).toEqual([{ kind: "code", start: paragraph.text.indexOf("parseConfig()"), end: paragraph.text.indexOf("parseConfig()") + "parseConfig()".length }]);
    });

    it("reads a typewritten paper as prose: its body face decides (FR-6)", () => {
        const { items } = page();
        const typed = items.map((item) => ({ ...runOf(item), mono: true }));
        expect(isTypewritten([typed, typed, typed])).toBe(true);
        expect(reflowPage(typed, { typewritten: true })).toEqual(BEFORE[0].blocks);
        const prose = items.map((item) => runOf(item));
        const code: TextRun[] = Array.from({ length: 30 }, (_, i) => ({ str: `let value${i} = compute(${i});`, x: 72, y: 700 - i * 12, size: 10, width: 150, mono: true }));
        expect(isTypewritten([prose, prose, code])).toBe(false);
        expect(isTypewritten([[{ str: "x = 1", x: 0, y: 0, size: 10, width: 30, mono: true }]])).toBe(false);
    });

    it("leaves a page with no monospace as it was (AC-7)", () => {
        const plain = page().runs.filter((run) => !run.mono);
        const blocks = reflowPage(plain);
        expect(blocks.every((block) => block.kind !== "listing" && !block.spans)).toBe(true);
        expect(blocks).toEqual(reflowPage(plain.map(({ mono: _mono, font: _font, ...run }) => run)));
    });
});
