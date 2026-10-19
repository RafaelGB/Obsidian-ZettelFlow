/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { Component, TFile, __setPdfJs } from "obsidian";
import { DomNode, flush, settle } from "../../../../support/dashboardDom";
import { withTextNodes } from "../../../../support/domText";
import { makePdfJs, prose, run, type FakePage } from "../../../../support/fakePdf";
import { FORMATS, formatsPage } from "../../../../support/pdfFormats";
import { image, opList } from "../../../../support/pdfPrintPaper";
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
        links: (FORMATS.pages[0].links ?? []).map((link) => ({ rect: link.rect as [number, number, number, number], ...(link.url ? { url: link.url } : {}) })),
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

    it("reads each font once, off the list each page is asked for once — the next one before you turn (FR-6, #852)", async () => {
        const { lib, calls } = makePdfJs({ pages: [formatsFake(), formatsFake(), { ...formatsFake(), runs: [{ str: "A face not seen before", x: 72, y: 700, size: 10, font: "FX" }] }], fonts: { ...FORMATS.fonts, FX: "Garamond-Italic" } });
        __setPdfJs(lib);
        const paper = new TFile();
        paper.path = "Papers/two.pdf";
        const doc = await openPdfSource({ vault: { readBinary: async () => new ArrayBuffer(4), getAbstractFileByPath: () => paper } } as never, paper);
        // Opening read the first pages' print (#852 FR-1): each page's list is asked for once, and kept.
        const opened = [...calls.opLists];
        expect(opened).toEqual([1, 2, 3]);
        await doc.draw(0, new DomNode("div") as never, new Component(), "reading");
        for (const index of [1, 2]) await doc.draw(index, new DomNode("div") as never, new Component(), "reading");
        expect(calls.opLists).toEqual(opened);
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

describe("links in the reading view (#841)", () => {
    it("links the words under a link out of the paper, shown and never followed (FR-2)", async () => {
        const { body } = await drawn([formatsFake()]);
        const out = body.findAll((el: any) => el.getAttribute?.("data-zf-url"));
        expect(out.map((el: any) => [el.tagName, el.textContent, el.getAttribute("data-zf-url")])).toEqual([["A", "example.org", "https://example.org"]]);
        expect(out[0].getAttribute("href")).toBeNull();
    });

    it("links the words under a link into the paper, to the page Page view would go to (FR-3)", async () => {
        const runs = prose(["Proofs of every claim are in the appendix, where", "the reader who wants them will find them waiting."]);
        const { doc, body } = await drawn([{ runs, links: [{ rect: [230, 696, 278, 709], dest: [{ num: 1 }, { name: "XYZ" }, 0, 700, 0] }] }, { runs: prose(["The appendix."]) }]);
        const link = body.find((el: any) => el.getAttribute?.("data-zf-dest"));
        expect(link.textContent).toBe("appendix,");
        expect(link.getAttribute("title")).toBe("Link in the paper");
        expect(await doc.pages!.destination(JSON.parse(link.getAttribute("data-zf-dest")))).toMatchObject({ page: 1 });
    });

    it("draws the same text, with or without its links (AC-1)", async () => {
        const { doc, body } = await drawn([formatsFake()]);
        expect(chapterText(body)).toBe((await doc.pages!.words!(0, 0)).text);
    });

    it("leaves a page with no links as it was, and never links a word already a footnote's (FR-6)", async () => {
        const { body } = await drawn([{ ...formatsFake(), links: [] }]);
        expect(body.findAll((el: any) => el.getAttribute?.("data-zf-url"))).toEqual([]);
        expect(body.findAll((el: any) => el.tagName === "A").map((el: any) => el.getAttribute("data-zf-href"))).toEqual(["#zf-pdf-note-1"]);
    });
});

describe("islands of print, drawn (#854 FR-3, FR-4, AC-2, AC-5)", () => {
    const PAGE: FakePage = {
        runs: [
            ...prose(["The paragraph above the figure reads as it always did, a full line long."], { top: 720 }),
            run("Figure 1. The caption under it stays text.", 72, 300, 10, true),
            ...prose(["And the paragraph after the caption goes on, as text, as before."], { top: 270 }),
        ],
        ops: opList(image(72, 320, 468, 360)),
    };
    const figures = (body: any) => body.findAll((el: any) => el.hasClass("zettelkasten-flow__reader-pdf-island"));
    // A canvas that can be drawn on, as the run's tests give one: pdf.js is asked to draw only then.
    const proto = DomNode.prototype as any;
    beforeAll(() => {
        proto.getContext = () => ({ drawImage: () => undefined });
    });
    afterAll(() => {
        delete proto.getContext;
    });

    it("draws a figure in its place, at its final shape, its words kept under it", async () => {
        const { body } = await drawn([PAGE]);
        const [figure] = figures(body);
        expect(figure).toBeDefined();
        expect(Number(figure.cssProps["--zf-island-aspect"])).toBeGreaterThan(1);
        expect(figure.find((el: any) => el.hasClass("zettelkasten-flow__reader-pdf-island-text"))).toBeDefined();
        // In reading order: the paragraph, the figure, its caption.
        const order = body.children.map((el: any) => el.tagName);
        expect(order).toEqual(["P", "FIGURE", "P", "P"]);
    });

    it("draws the crop of the page that holds it, and nothing else of the page", async () => {
        const { lib, calls } = makePdfJs({ pages: [PAGE] });
        __setPdfJs(lib);
        const paper = new TFile();
        paper.path = "Papers/fig.pdf";
        const doc = await openPdfSource({ vault: { readBinary: async () => new ArrayBuffer(4), getAbstractFileByPath: () => paper } } as never, paper);
        const body = new DomNode("div");
        await doc.draw(0, body as never, new Component(), "reading");
        await settle(() => calls.renders.length > 0);
        const crop = calls.renders[0];
        // The viewport is moved to the figure's corner: the crop, not the page.
        expect(crop.offsetX).toBeLessThan(0);
        expect(crop.offsetY).toBeLessThan(0);
    });

    it("waits until the island nears the screen, and draws it again from what it kept (AC-5)", async () => {
        const watched: { cb: (entries: { isIntersecting: boolean; target: unknown }[]) => void; targets: unknown[] }[] = [];
        const g = globalThis as any;
        const hadWindow = "window" in g;
        g.window ??= g;
        const before = g.IntersectionObserver;
        g.IntersectionObserver = class {
            targets: unknown[] = [];
            constructor(cb: (entries: { isIntersecting: boolean; target: unknown }[]) => void) {
                watched.push({ cb, targets: this.targets });
            }
            observe(target: unknown) {
                this.targets.push(target);
            }
            unobserve() {}
            disconnect() {}
        };
        try {
            const { lib, calls } = makePdfJs({ pages: [PAGE] });
            __setPdfJs(lib);
            const paper = new TFile();
            paper.path = "Papers/lazy.pdf";
            const doc = await openPdfSource({ vault: { readBinary: async () => new ArrayBuffer(4), getAbstractFileByPath: () => paper } } as never, paper);
            const draw = async () => {
                const body = new DomNode("div");
                await doc.draw(0, body as never, new Component(), "reading");
                await flush();
                return body;
            };
            await draw();
            expect(calls.renders).toHaveLength(0);
            const near = watched[watched.length - 1];
            near.cb(near.targets.map((target) => ({ isIntersecting: true, target })));
            await settle(() => calls.renders.length === 1);
            // The page turned away and back: the island is drawn from what was kept, not by pdf.js again.
            await draw();
            const again = watched[watched.length - 1];
            again.cb(again.targets.map((target) => ({ isIntersecting: true, target })));
            await flush();
            expect(calls.renders).toHaveLength(1);
        } finally {
            g.IntersectionObserver = before;
            if (!hadWindow) delete g.window;
        }
    });
});
