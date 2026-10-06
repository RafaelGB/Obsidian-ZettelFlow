import { describe, it, expect } from "@jest/globals";
import { pageText, reflowPage, runOf, type TextRun } from "application/library/pdfText";

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
