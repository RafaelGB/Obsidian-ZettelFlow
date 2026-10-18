/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { Component, TFile, __setPdfJs } from "obsidian";
import { DomNode } from "../../../../support/dashboardDom";
import { withTextNodes } from "../../../../support/domText";
import { makePdfJs, prose, run, type FakePage } from "../../../../support/fakePdf";
import { FORMATS, formatsPage } from "../../../../support/pdfFormats";
import { openPdfSource } from "architecture/components/core/library/sources/pdfSource";
import { chapterText } from "architecture/components/core/reader/readerMarks";
import { noteExcerpt } from "architecture/components/core/reader/readerJumps";

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

async function open(pages: FakePage[], fonts: Record<string, string> | null = FORMATS.fonts) {
    const { lib } = makePdfJs({ pages, ...(fonts ? { fonts } : {}) });
    __setPdfJs(lib);
    const paper = new TFile();
    paper.path = "Papers/formats.pdf";
    paper.name = "formats.pdf";
    paper.extension = "pdf";
    const app = { vault: { readBinary: async () => new ArrayBuffer(4), getAbstractFileByPath: () => paper } };
    return openPdfSource(app as never, paper);
}

async function drawn(pages: FakePage[], fonts?: Record<string, string> | null) {
    const doc = await open(pages, fonts === undefined ? FORMATS.fonts : fonts);
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

describe("a PDF's lists, drawn (#838)", () => {
    it("draws a bulleted and a numbered list, each marker the page's own characters (AC-2)", async () => {
        const { body } = await drawn([formatsFake()]);
        const lists = body.findAll((el: any) => el.hasClass("zettelkasten-flow__reader-pdf-list"));
        expect(lists.map((el: any) => [el.tagName, el.children.length])).toEqual([
            ["UL", 2],
            ["OL", 2],
        ]);
        expect(lists[0].byClass("reader-pdf-marker")[0].textContent).toBe("• ");
        expect(lists[1].byClass("reader-pdf-item-text")[1].textContent).toBe("Another numbered item ");
    });

    it("nests a deeper list inside the item before it, and a part inside its item", async () => {
        const { body } = await drawn([{ runs: [run("• outer one", 72, 700), run("◦ inner one", 90, 688), run("• outer two.", 72, 676), run("Its own second paragraph.", 83, 664)] }]);
        const outer = body.find((el: any) => el.tagName === "UL");
        const first = outer.children[0];
        expect(first.find((el: any) => el.tagName === "UL")?.byClass("reader-pdf-item-text")[0].textContent).toBe("inner one ");
        expect(outer.children[1].byClass("reader-pdf-part").map((el: any) => el.textContent)).toEqual(["Its own second paragraph."]);
        expect(chapterText(body)).toBe("• outer one ◦ inner one • outer two.Its own second paragraph.");
    });
});

describe("bold and italic, drawn (#839)", () => {
    const marked = (body: any, tag: string) => body.findAll((el: any) => el.tagName === tag).map((el: any) => el.textContent);

    it("draws the bold term and the italic phrase as strong and em, the heading as it was", async () => {
        const { body } = await drawn([formatsFake()]);
        expect(marked(body, "STRONG")).toEqual(["bold term"]);
        expect(marked(body, "EM")).toEqual(["italic phrase"]);
        expect(body.find((el: any) => el.tagName === "H2").find((el: any) => el.tagName === "STRONG")).toBeUndefined();
    });

    it("draws a page whose fonts cannot be read as it always did, its text the same (FR-7)", async () => {
        const plain = await drawn([formatsFake()], null);
        expect(marked(plain.body, "STRONG")).toEqual([]);
        const styled = await drawn([formatsFake()]);
        expect(chapterText(plain.body)).toBe(chapterText(styled.body));
    });

    it("reads each font once: a later page with the same fonts waits for nothing (FR-6)", async () => {
        const { lib, calls } = makePdfJs({ pages: [formatsFake(), formatsFake(), { ...formatsFake(), runs: [{ str: "A face not seen before", x: 72, y: 700, size: 10, font: "FX" }] }], fonts: { ...FORMATS.fonts, FX: "Garamond-Italic" } });
        __setPdfJs(lib);
        const paper = new TFile();
        paper.path = "Papers/two.pdf";
        const doc = await openPdfSource({ vault: { readBinary: async () => new ArrayBuffer(4), getAbstractFileByPath: () => paper } } as never, paper);
        for (const index of [0, 1, 2]) await doc.draw(index, new DomNode("div") as never, new Component(), "reading");
        expect(calls.opLists).toEqual([1, 3]);
    });
});

describe("footnotes and block quotes, drawn (#840)", () => {
    it("draws the marker raised, opening its footnote by the path a book's takes (FR-7)", async () => {
        const { doc, body } = await drawn([formatsFake()]);
        const link = body.find((el: any) => el.tagName === "A");
        expect(link.getAttribute("data-zf-href")).toBe("#zf-pdf-note-1");
        expect(link.children.filter((el: any) => el.tagName === "SUP").map((el: any) => el.textContent)).toEqual(["1"]);
        expect(doc.resolveLink!(0, "#zf-pdf-note-1")).toEqual({ chapter: 0, fragment: "zf-pdf-note-1" });
        expect(doc.resolveLink!(0, "https://example.org")).toBeNull();
        const note = body.find((el: any) => el.getAttribute?.("data-zf-id") === "zf-pdf-note-1");
        expect(note.hasClass("zettelkasten-flow__reader-pdf-footnote")).toBe(true);
        expect(note.getAttribute("role")).toBe("note");
        expect(noteExcerpt(note)).toBe("1 The footnote text, small, at the foot of the page.");
    });

    it("draws a block quote as the theme's own blockquote", async () => {
        const { body } = await drawn([formatsFake()]);
        const quote = body.find((el: any) => el.tagName === "BLOCKQUOTE");
        expect(quote.children.map((el: any) => el.tagName)).toEqual(["P"]);
        expect(quote.textContent).toContain("A quoted passage set in from both margins");
    });

    it("still draws exactly the text Page view indexes, with every format on the page (AC-1)", async () => {
        const { doc, body } = await drawn([formatsFake()]);
        expect(chapterText(body)).toBe((await doc.pages!.words!(0, 0)).text);
    });
});
