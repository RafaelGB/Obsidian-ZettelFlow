import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { TFile, __setPdfJs } from "obsidian";
import { makePdfJs, prose } from "../../../../support/fakePdf";
import { makeEpub } from "../../../../support/zipFixture";
import { parseXml } from "../../../../support/miniXml";
import { openPdfSource } from "architecture/components/core/library/sources/pdfSource";
import { openEpubSource } from "architecture/components/core/library/sources/epubSource";
import { captureRegion, captureScale } from "architecture/components/core/reader/readerSnapshot";

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

/**
 * **A snapshot is drawn again, never copied from the screen** (#763 FR-3, T2): a paper's region is
 * rendered by pdf.js at the capture's scale with its viewport moved to the region, and an EPUB's
 * picture is the archive's own bytes and type.
 */

function file(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    f.extension = path.split(".").pop() ?? "";
    return f;
}

function scratch() {
    const canvas: any = {
        width: 0,
        height: 0,
        sizes: [] as number[][],
        getContext: () => ({}),
        toBlob(done: (b: Blob | null) => void, type: string) {
            canvas.sizes.push([canvas.width, canvas.height]);
            done(new Blob(["png"], { type }));
        },
    };
    return { canvas, doc: (() => canvas) as any };
}

describe("a paper's region, rendered at the capture's scale (#763 FR-3)", () => {
    afterAll(() => __setPdfJs(null));

    async function paper() {
        const fake = makePdfJs({ pages: [{ runs: prose(["A figure of forecasts by project type."]) }, { runs: prose(["Table 2."]) }] });
        __setPdfJs(fake.lib);
        const pdf = file("Papers/paper.pdf");
        const app = { vault: { readBinary: async () => new ArrayBuffer(4), getAbstractFileByPath: () => pdf } };
        return { doc: await openPdfSource(app as never, pdf), calls: fake.calls };
    }

    it("renders a region with a viewport at that scale, moved to the region, into a canvas of its size", async () => {
        const { doc, calls } = await paper();
        const { canvas, doc: dom } = scratch();
        // 1.5 CSS px per point on screen; the region is 0.5 × 0.25 of a 612 × 792 page.
        const size = { width: 0.5 * 612, height: 0.25 * 792 };
        const scale = captureScale(1.5, size);
        expect(scale).toBe(3);
        const blob = await captureRegion(doc.pages!.render!.bind(doc.pages), dom, 1, { scale, rotation: 0, frame: { x: 0.1, y: 0.2, w: 0.5, h: 0.25 } });
        expect(blob?.type).toBe("image/png");
        const drawn = calls.renders[calls.renders.length - 1];
        expect(drawn.page).toBe(2);
        expect(drawn.scale).toBe(3);
        expect(drawn.offsetX).toBeCloseTo(-0.1 * 612 * 3, 6);
        expect(drawn.offsetY).toBeCloseTo(-0.2 * 792 * 3, 6);
        // The capture is the region at twice its size on screen — not the screen's pixels.
        expect(canvas.sizes[0]).toEqual([Math.round(0.5 * 612 * 3), Math.round(0.25 * 792 * 3)]);
        expect(canvas.width).toBe(0);
    });

    it("renders the whole page when no region is asked (a page drawn as its picture, a scan)", async () => {
        const { doc, calls } = await paper();
        const { canvas, doc: dom } = scratch();
        await captureRegion(doc.pages!.render!.bind(doc.pages), dom, 0, { scale: 2, rotation: 0 });
        const drawn = calls.renders[calls.renders.length - 1];
        expect([drawn.page, drawn.scale, drawn.offsetX, drawn.offsetY]).toEqual([1, 2, 0, 0]);
        expect(canvas.sizes[0]).toEqual([1224, 1584]);
    });
});

describe("an EPUB's picture keeps its own bytes and type (#763 FR-3)", () => {
    beforeAll(() => {
        g.DOMParser = class {
            parseFromString(text: string) {
                return { ...parseXml(text), getElementsByTagName: () => [] };
            }
        };
    });
    afterAll(() => {
        delete g.DOMParser;
    });

    it("reads the archive's file by the path a drawn chapter keeps", async () => {
        const gif = new Uint8Array([71, 73, 70, 56, 57, 97]);
        const bytes = makeEpub({
            title: "Thinking, Fast and Slow",
            chapters: [{ id: "c1", href: "text/ch1.xhtml", title: "1 · Figures", body: '<p>A figure.</p><img src="../images/fig.gif" alt="Figure"/>' }],
            extra: { "OEBPS/images/fig.gif": gif },
        });
        const book = file("Books/tfs.epub");
        const app = { vault: { getAbstractFileByPath: () => book, readBinary: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } };
        const doc = await openEpubSource(app as never, book);
        const blob = await doc.imageBytes!("OEBPS/images/fig.gif");
        expect(blob?.type).toBe("image/gif");
        expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(gif);
        expect(await doc.imageBytes!("OEBPS/images/missing.png")).toBeNull();
    });
});
