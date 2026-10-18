/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { Component, TFile, __setPdfJs } from "obsidian";
import { DomNode } from "../../../../support/dashboardDom";
import { withTextNodes } from "../../../../support/domText";
import { makePdfJs, prose, type FakePage } from "../../../../support/fakePdf";
import { FORMATS, formatsPage } from "../../../../support/pdfFormats";
import { openPdfSource } from "architecture/components/core/library/sources/pdfSource";
import { chapterText } from "architecture/components/core/reader/readerMarks";

/**
 * **A PDF page drawn with its formats** (epic #836): the elements the reading view builds from the
 * blocks, and the one rule under them — the text drawn is the text Page view indexes.
 */

let undo: () => void;
beforeAll(() => {
    undo = withTextNodes();
});
afterAll(() => {
    undo();
    __setPdfJs(null);
});

/** The formats paper as the fake pdf.js serves it: its runs with their fonts, and its styles. */
function formatsFake(): FakePage {
    const { items, styles } = formatsPage(0);
    return {
        runs: items.map((item) => ({ str: item.str, x: item.transform[4], y: item.transform[5], size: item.transform[0], width: item.width, font: item.fontName })),
        styles,
        width: FORMATS.width,
        height: FORMATS.height,
    };
}

async function open(pages: FakePage[]) {
    const { lib } = makePdfJs({ pages });
    __setPdfJs(lib);
    const paper = new TFile();
    paper.path = "Papers/formats.pdf";
    paper.name = "formats.pdf";
    paper.extension = "pdf";
    const app = { vault: { readBinary: async () => new ArrayBuffer(4), getAbstractFileByPath: () => paper } };
    return openPdfSource(app as never, paper);
}

async function drawn(pages: FakePage[]) {
    const doc = await open(pages);
    const body = new DomNode("div");
    const result = await doc.draw(0, body as never, new Component(), "reading");
    return { doc, body: body as any, result };
}

describe("code in a PDF, drawn (#837)", () => {
    it("draws the listing as #824's: named, in lines, and says the page has one", async () => {
        const { body, result } = await drawn([formatsFake()]);
        const pre = body.find((el: any) => el.tagName === "PRE");
        expect(pre.hasClass("zettelkasten-flow__reader-code")).toBe(true);
        expect(pre.getAttribute("role")).toBe("group");
        expect(pre.getAttribute("aria-label")).toBe("Code");
        const lines = pre.byClass("reader-code-line");
        expect(lines).toHaveLength(3);
        expect(lines[1].textContent).toBe("    return 'Hello ' + name;\n");
        expect(result.listings).toBe(1);
    });

    it("draws a monospace name in a sentence as inline code, inside its paragraph (AC-5)", async () => {
        const { body } = await drawn([formatsFake()]);
        const code = body.findAll((el: any) => el.tagName === "CODE" && el.parentElement?.tagName === "P");
        expect(code.map((el: any) => el.textContent)).toEqual(["parseConfig()"]);
    });

    it("draws exactly the text Page view indexes (AC-1)", async () => {
        const { doc, body } = await drawn([formatsFake()]);
        const words = await doc.pages!.words!(0, 0);
        expect(chapterText(body)).toBe(words.text);
        // A word of the listing's second line is found where it is drawn.
        const word = words.words.find((w) => words.text.slice(w.start, w.end) === "return")!;
        expect(chapterText(body).slice(word.start, word.end)).toBe("return");
    });

    it("draws a page with no formats as it always was (AC-7)", async () => {
        const { body, result } = await drawn([{ runs: prose(["A paragraph of plain prose that runs on for a while and then", "stops at the end of its second line, as a paper's would."]) }]);
        expect(body.children.map((el: any) => el.tagName)).toEqual(["P"]);
        expect(result.listings).toBeUndefined();
    });
});
