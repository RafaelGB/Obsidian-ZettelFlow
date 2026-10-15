import { describe, it, expect } from "@jest/globals";
import { FORM_FRAGMENT_SHARE, FRAGMENT_WORDS, MIN_SAMPLE_BLOCKS, SPARSE_PAGE_WORDS, pageText, reflowPage, runOf, suggestPdfView, type TextRun } from "application/library/pdfText";

const run = (str: string, x: number, y: number, size = 10, width = str.length * size * 0.5): TextRun => ({ str, x, y, size, width });

/** Lines of one paragraph, set like a paper: 12 units apart, flush left at 72. */
function para(lines: string[], top: number, options: { x?: number; size?: number; gap?: number } = {}): TextRun[] {
    const { x = 72, size = 10, gap = 12 } = options;
    return lines.map((line, i) => run(line, x, top - i * gap, size));
}

describe("a PDF page read back as paragraphs (#681)", () => {
    it("puts runs on one baseline into one line, with the spaces nobody typed", () => {
        const blocks = reflowPage([run("Event", 72, 700), run("sourcing", 102, 700.4), run("stores changes.", 150, 699.8)]);
        expect(blocks).toEqual([{ kind: "paragraph", text: "Event sourcing stores changes." }]);
    });

    it("breaks paragraphs on a wider gap, keeps lines of one paragraph together, and mends a hyphen", () => {
        const blocks = reflowPage([
            ...para(["In this section we consider the asynchronous net-", "work model, in which there is no clock and nodes must", "decide on the messages they receive."], 700),
            ...para(["It is impossible to implement a read/write object that", "guarantees availability and atomic consistency."], 650),
        ]);
        expect(blocks.map((b) => b.text)).toEqual([
            "In this section we consider the asynchronous network model, in which there is no clock and nodes must decide on the messages they receive.",
            "It is impossible to implement a read/write object that guarantees availability and atomic consistency.",
        ]);
    });

    it("breaks on an indented first line, even with no gap", () => {
        const blocks = reflowPage([
            ...para(["The first paragraph runs across the whole width of the", "column and ends here, with a full line before it ends."], 700),
            run("A second paragraph starts indented, the way books set them", 92, 676),
            run("and goes on flush left.", 72, 664),
        ]);
        expect(blocks).toHaveLength(2);
        expect(blocks[1].text).toBe("A second paragraph starts indented, the way books set them and goes on flush left.");
    });

    it("takes a larger line for a heading, and leaves a lone page number out", () => {
        const blocks = reflowPage([
            run("3 Asynchronous Networks", 72, 740, 16),
            ...para(["There is no clock in this model, and that is the whole of the trouble it", "makes for anyone who wants an answer."], 710),
            run("6", 300, 40),
        ]);
        expect(blocks).toEqual([
            { kind: "heading", text: "3 Asynchronous Networks" },
            { kind: "paragraph", text: "There is no clock in this model, and that is the whole of the trouble it makes for anyone who wants an answer." },
        ]);
    });

    it("reads a page in two columns one column, then the other", () => {
        const left = para(Array.from({ length: 6 }, (_, i) => `Left column line ${i + 1} of the paper`), 700, { x: 72 });
        const right = para(Array.from({ length: 6 }, (_, i) => `Right column line ${i + 1} of the paper`), 700, { x: 320 });
        const text = pageText(reflowPage([...left, ...right]));
        expect(text.indexOf("Left column line 6")).toBeLessThan(text.indexOf("Right column line 1"));
        expect(text.startsWith("Left column line 1")).toBe(true);
    });

    it("reads a pdf.js item's place and size off its transform", () => {
        expect(runOf({ str: "x", transform: [12, 0, 0, 12, 50, 600], width: 6 })).toEqual({ str: "x", x: 50, y: 600, size: 12, width: 6 });
    });

    it("reads nothing off an empty page", () => {
        expect(reflowPage([])).toEqual([]);
    });
});

describe("the view a PDF reads best in (#813 FR-20, FR-21)", () => {
    const para = (n: number) => ({ kind: "paragraph" as const, text: Array.from({ length: n }, (_, i) => `word${i}`).join(" ") });

    it("keeps a form as printed: most of its blocks are fragments", () => {
        const form = [para(3), para(2), para(4), para(1), para(40), para(2), para(5), para(3)];
        expect(suggestPdfView([form, form])).toBe("page");
    });

    it("keeps a page of figures as printed: little text on it", () => {
        const figures = [para(12), para(8), para(10), para(9)];
        expect(suggestPdfView([figures, figures])).toBe("page");
    });

    it("reflows a sample too small to tell, as before", () => {
        expect(suggestPdfView([[para(3), para(2)], [para(1)]])).toBe("reading");
    });

    it("reflows prose", () => {
        const prose = [para(80), para(95), para(60), para(4)];
        expect(suggestPdfView([prose, prose, prose])).toBe("reading");
    });

    it("reflows what it could not sample, as before, and always answers the same", () => {
        expect(suggestPdfView([])).toBe("reading");
        expect(suggestPdfView([[]])).toBe("reading");
        const pages = [[para(3), para(50)], [para(70)]];
        expect(suggestPdfView(pages)).toBe(suggestPdfView(pages));
        expect([FRAGMENT_WORDS, FORM_FRAGMENT_SHARE, SPARSE_PAGE_WORDS, MIN_SAMPLE_BLOCKS]).toEqual([6, 0.5, 60, 8]);
    });
});
