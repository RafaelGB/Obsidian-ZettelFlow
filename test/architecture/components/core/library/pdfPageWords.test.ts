import { describe, it, expect, afterAll } from "@jest/globals";
import { Component, TFile, __setPdfJs } from "obsidian";
import { DomNode } from "../../../../support/dashboardDom";
import { makePdfJs, prose, run, type FakePage } from "../../../../support/fakePdf";
import { openPdfSource } from "architecture/components/core/library/sources/pdfSource";
import { quoteAt } from "application/thinking/quoteAnchor";
import { pageHeadingAt } from "application/library/pdfWords";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * **The words of a printed page** (#746 FR-9): Page view has no text layer, so a highlight stroke
 * there reads the page's own text runs — boxes as fractions of the page, offsets into the very text
 * the Reading view reflows that page into.
 */

afterAll(() => __setPdfJs(null));

async function open(pages: FakePage[]) {
    const { lib } = makePdfJs({ pages });
    __setPdfJs(lib);
    const paper = new TFile();
    paper.path = "Papers/p.pdf";
    paper.name = "p.pdf";
    paper.extension = "pdf";
    const app = { vault: { readBinary: async () => new ArrayBuffer(4), getAbstractFileByPath: () => paper } };
    return openPdfSource(app as never, paper);
}

const LINES = ["Seth Gilbert and Nancy Lynch argue that a web service cannot be consis-", "tent, available and partition tolerant at once, in any network."];

describe("the words of a printed page (#746 FR-9, AC-8)", () => {
    it("gives each word a box as fractions of the page", async () => {
        const doc = await open([{ runs: [run("A heading for the page", 72, 740, 18), ...prose(LINES, { top: 700 })] }]);
        const page = await doc.pages!.words!(0, 0);
        const seth = page.words.find((w) => page.text.slice(w.start, w.end) === "Seth")!;
        // 72 pt from the left of a 612 pt page; the baseline at 700 of 792, a 10 pt size.
        expect(seth.left).toBeCloseTo(72 / 612, 4);
        expect(seth.width).toBeCloseTo((4 * 5) / 612, 4);
        expect(seth.top).toBeCloseTo((792 - 700 - 8.5) / 792, 3);
        for (const w of page.words) {
            expect(w.left).toBeGreaterThanOrEqual(0);
            expect(w.left + w.width).toBeLessThanOrEqual(1);
            expect(w.top).toBeGreaterThanOrEqual(0);
            expect(w.top + w.height).toBeLessThanOrEqual(1);
        }
    });

    it("indexes the very text the Reading view draws, so a quote made here is found there", async () => {
        const doc = await open([{ runs: [run("A heading for the page", 72, 740, 18), ...prose(LINES, { top: 700 })] }]);
        const page = await doc.pages!.words!(0, 0);
        const body = new DomNode();
        await doc.draw(0, body as never, new Component(), "reading");
        expect(page.text).toBe(body.textContent);
        // Every word's offsets are that word in the text.
        for (const w of page.words) expect(page.text.slice(w.start, w.end)).toMatch(/^\S+$/);
        // A word mended across the line break is one word, from either half.
        const halves = page.words.filter((w) => page.text.slice(w.start, w.end) === "consistent,");
        expect(halves).toHaveLength(2);
        const made = quoteAt(page.text, page.words[5].start, page.words[8].end)!;
        expect(made.quote.exact).toBe("Seth Gilbert and Nancy");
        expect(page.text.indexOf(made.quote.exact)).toBe(made.span.start);
        expect(pageHeadingAt(page, made.span.start)).toBe("A heading for the page");
    });

    it("has no words on an image-only page", async () => {
        const doc = await open([{ runs: [] }, { runs: [run("12", 300, 40)] }]);
        expect((await doc.pages!.words!(0, 0)).words).toEqual([]);
        expect((await doc.pages!.words!(1, 0)).words).toEqual([]);
    });

    it("leaves a rotated run out: a label up the margin is not a line of the text", async () => {
        const doc = await open([{ runs: [...prose(LINES, { top: 700 }), { str: "arXiv:2026.00746v1", x: 30, y: 300, size: 10 }] }]);
        const pages = doc.pages!;
        // The fake draws every run upright; turn the label a quarter in its transform.
        const raw = await (pages as any).words(0, 0);
        expect(raw.words.some((w: any) => raw.text.slice(w.start, w.end).startsWith("arXiv"))).toBe(true);
        const { lib } = makePdfJs({ pages: [{ runs: prose(LINES, { top: 700 }) }] });
        const doc2 = await openRotated(lib, { str: "arXiv:2026.00746v1", transform: [0, 10, -10, 0, 30, 300], width: 90, height: 10 });
        const turned = await doc2.pages!.words!(0, 0);
        expect(turned.words.some((w) => turned.text.slice(w.start, w.end).startsWith("arXiv"))).toBe(false);
        expect(turned.words.length).toBeGreaterThan(10);
    });

    it("follows the reader's own turn of the page", async () => {
        const doc = await open([{ runs: prose(LINES, { top: 700 }) }]);
        const upright = await doc.pages!.words!(0, 0);
        const turned = await doc.pages!.words!(0, 90);
        const a = upright.words[0];
        const b = turned.words[0];
        expect(b.start).toBe(a.start);
        // A quarter turn clockwise: the left edge of the page is now its top.
        expect(b.top).toBeCloseTo(a.left, 3);
    });
});

/** The fake pdf.js, with one extra item whose transform is turned. */
async function openRotated(lib: any, extra: Record<string, unknown>) {
    const getDocument = lib.getDocument;
    const patched = {
        getDocument: (source: unknown) => {
            const task = getDocument(source);
            return {
                promise: task.promise.then((doc: any) => ({
                    ...doc,
                    getPage: async (n: number) => {
                        const page = await doc.getPage(n);
                        return { ...page, getTextContent: async () => ({ items: [...(await page.getTextContent()).items, { ...extra, hasEOL: false }] }) };
                    },
                })),
            };
        },
    };
    __setPdfJs(patched as never);
    const paper = new TFile();
    paper.path = "Papers/r.pdf";
    paper.name = "r.pdf";
    paper.extension = "pdf";
    return openPdfSource({ vault: { readBinary: async () => new ArrayBuffer(4), getAbstractFileByPath: () => paper } } as never, paper);
}
