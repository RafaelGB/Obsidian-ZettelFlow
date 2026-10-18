import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { faceOf, isTypewritten, reflowPage, runOf, suggestPdfView, type PageBlock, type TextRun } from "application/library/pdfText";
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
    it("reads the page as it always did when asked for plain blocks", () => {
        expect(reflowPage(page().runs, { plain: true })).toEqual(BEFORE[0].blocks);
    });

    it("keeps every character in order, and every space outside a listing", () => {
        const text = joined(reflowPage(page().runs));
        expect(nonSpace(text)).toBe(nonSpace(BEFORE[0].text));
        // The one change: a listing's lines are lines, so its last one starts on its own (#837).
        expect(folded(text)).toBe(folded(BEFORE[0].text).replace("name;}", "name; }"));
    });

    it("leaves the view a PDF suggests where it was (#837 FR-11)", () => {
        expect(suggestPdfView([reflowPage(page().runs, { plain: true })])).toBe(suggestPdfView([BEFORE[0].blocks]));
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
        const blocks = reflowPage(typed, { typewritten: true });
        expect(blocks.some((block) => block.kind === "listing" || block.spans?.some((span) => span.kind === "code"))).toBe(false);
        expect(nonSpace(joined(blocks))).toBe(nonSpace(BEFORE[0].text));
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

describe("a PDF's lists keep their items (#838)", () => {
    const at = (str: string, x: number, y: number): TextRun => ({ str, x, y, size: 10, width: str.length * 5 });
    const items = (blocks: readonly PageBlock[]) => blocks.filter((block) => block.kind === "item");

    it("makes the bulleted and the numbered lines of the formats page two lists, the marker in the text (AC-2)", () => {
        const found = items(reflowPage(page().runs));
        expect(found.map((block) => [block.text.slice(0, block.marker), block.ordered, block.level])).toEqual([
            ["• ", false, 0],
            ["• ", false, 0],
            ["1. ", true, 0],
            ["2. ", true, 0],
        ]);
        // Today's space between the items stays at the end of each one.
        expect(found[0].text).toBe("• First item of a list ");
    });

    it("takes only a clear list: a lone number or dash stays prose, a lone sure bullet is an item (AC-3, AC-4)", () => {
        const kinds = (runs: TextRun[]) => reflowPage(runs).map((block) => block.kind);
        expect(kinds([at("1. Introduction to the problem", 72, 700), at("The text of the section goes on below it.", 72, 688)])).not.toContain("item");
        expect(kinds([at("- one thing said in passing", 72, 700), at("and the sentence goes on with the next line.", 72, 688)])).not.toContain("item");
        expect(kinds([at("1. One step", 72, 700), at("3. Another step", 72, 688)])).not.toContain("item");
        expect(kinds([at("J. Smith wrote the first draft.", 72, 700), at("K. Jones wrote the second one.", 72, 688)])).not.toContain("item");
        expect(kinds([at("• the one bullet on the page", 72, 700)])).toEqual(["item"]);
        expect(kinds([at("a) first", 72, 700), at("b) second", 72, 688)])).toEqual(["item", "item"]);
        expect(kinds([at("(i) first", 72, 700), at("(ii) second", 72, 688)])).toEqual(["item", "item"]);
    });

    it("nests an item by where its marker sits, and comes back out (AC-5)", () => {
        const levels = items(reflowPage([at("• outer one", 72, 700), at("◦ inner one", 90, 688), at("◦ inner two", 90, 676), at("• outer two", 72, 664)])).map((block) => block.level);
        expect(levels).toEqual([0, 1, 1, 0]);
    });

    it("joins a line set under an item's words to the item, and ends the list at the margin (AC-6)", () => {
        const blocks = reflowPage([
            at("• An item whose words run on past the end of its first", 72, 700),
            at("line and go on under them here.", 82, 688),
            at("The paragraph after the list starts back at the margin.", 72, 676),
        ]);
        expect(blocks.map((block) => block.kind)).toEqual(["item", "paragraph"]);
        expect(blocks[0].text).toBe("• An item whose words run on past the end of its first line and go on under them here.");
    });

    it("keeps a continuation today cut from its item as a part of it, never glued to it", () => {
        const blocks = reflowPage([at("• A short item.", 72, 700), at("Its second paragraph, under its words.", 82, 688)]);
        expect(blocks.map((block) => [block.kind, Boolean(block.cont)])).toEqual([
            ["item", false],
            ["item", true],
        ]);
        expect(joined(blocks)).toBe("• A short item.Its second paragraph, under its words.");
    });

    it("leaves the text as it was: every list fixture reads the same characters and spaces (AC-1)", () => {
        const runs = [at("Before the list, a sentence that runs on", 72, 700), at("• first item", 72, 688), at("• second item", 72, 676), at("1. one", 72, 664), at("2. two", 72, 652)];
        expect(joined(reflowPage(runs))).toBe(joined(reflowPage(runs, { plain: true })));
    });
});

describe("bold and italic, from the font's real name (#839)", () => {
    const facesOfPage = () => {
        const { items, styles, names } = formatsPage();
        const faces = Object.fromEntries(Object.entries(names).map(([id, name]) => [id, faceOf(name)]));
        return items.map((item) => runOf(item, styles, faces));
    };

    it("reads the style part of a name, and nothing else (FR-2)", () => {
        expect(faceOf("Times-Bold")).toEqual({ bold: true });
        expect(faceOf("Times-Italic")).toEqual({ italic: true });
        expect(faceOf("ABCDEF+MinionPro-BoldIt")).toEqual({ bold: true, italic: true });
        expect(faceOf("Arial,BoldItalic")).toEqual({ bold: true, italic: true });
        expect(faceOf("Helvetica-Oblique")).toEqual({ italic: true });
        expect(faceOf("TimesNewRomanPS-BoldMT")).toEqual({ bold: true });
        expect(faceOf("Boldini-Regular")).toEqual({});
        expect(faceOf("Times-Roman")).toEqual({});
        // The faces LaTeX sets a paper in, as a real arXiv paper names them.
        expect(faceOf("RCUMTF+NimbusRomNo9L-Medi")).toEqual({ bold: true });
        expect(faceOf("NimbusRomNo9L-ReguItal")).toEqual({ italic: true });
        expect(faceOf("NimbusRomNo9L-Regu")).toEqual({});
        expect(faceOf("FUIULY+CMBX10")).toEqual({ bold: true });
        expect(faceOf("CMTI10")).toEqual({ italic: true });
        expect(faceOf("CMR10")).toEqual({});
        expect(faceOf("LICAEO+CMMI10")).toEqual({});
        expect(faceOf(undefined)).toEqual({});
    });

    it("marks the bold term and the italic phrase, never the heading set in bold (AC-1, AC-4)", () => {
        const blocks = reflowPage(facesOfPage());
        const paragraph = blocks.find((block) => block.text.startsWith("This paragraph"))!;
        const marked = (paragraph.spans ?? []).map((span) => [span.kind, paragraph.text.slice(span.start, span.end)]);
        expect(marked).toEqual([
            ["strong", "bold term"],
            ["em", "italic phrase"],
            ["code", "parseConfig()"],
        ]);
        expect(blocks[0]).toEqual({ kind: "heading", text: "Chapter 1. Formats in a paper" });
    });

    it("does not mark a block set wholly in one face: that is just its font (FR-4)", () => {
        const italic = (str: string, y: number): TextRun => ({ str, x: 72, y, size: 10, width: str.length * 5, italic: true });
        const [block] = reflowPage([italic("A whole paragraph set in italic, as an epigraph", 700), italic("or a quotation is, carries no emphasis at all.", 688)]);
        expect(block.spans).toBeUndefined();
    });

    it("never moves a character: the text is the same with faces or without (AC-1)", () => {
        expect(joined(reflowPage(facesOfPage()))).toBe(joined(reflowPage(page().runs)));
    });
});
