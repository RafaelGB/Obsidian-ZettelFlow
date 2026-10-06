import { describe, it, expect, beforeEach, afterAll } from "@jest/globals";
import { TFile, __setPdfJs } from "obsidian";
import { clearCoverCache, cachedCover, readCover } from "architecture/components/core/library/libraryCovers";
import { declared } from "architecture/components/core/library/sources/pdfjs";
import { makePdfJs, prose } from "../../../../support/fakePdf";
import { makeEpub } from "../../../../support/zipFixture";
import { isImageOnly } from "application/library/pdfText";

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

function file(path: string, mtime = 1): TFile {
    const f = new TFile();
    f.path = path;
    f.extension = path.split(".").pop() ?? "";
    (f as any).stat = { size: 100, mtime, ctime: 1 };
    return f;
}

function appWith(bytes: Uint8Array) {
    return { vault: { readBinary: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } } as any;
}

describe("covers and what a source declares (#680)", () => {
    const created: string[] = [];
    beforeEach(() => {
        clearCoverCache();
        // A canvas that draws nothing and hands back a picture: what the cover needs of one.
        g.createEl = () => ({ getContext: () => ({}), toBlob: (done: (b: Blob) => void) => done(new Blob(["jpg"])) });
        g.URL.createObjectURL = () => {
            const url = `blob:${created.length}`;
            created.push(url);
            return url;
        };
        g.URL.revokeObjectURL = () => undefined;
    });
    afterAll(() => {
        delete g.createEl;
        __setPdfJs(null);
    });

    it("reads a PDF's first page as its cover, its length, and what it declares — as data, never a URL", async () => {
        const { lib, calls } = makePdfJs({
            pages: [{ runs: prose(["Brewer's Conjecture and the Feasibility of Consistent Web Services", "Seth Gilbert, Nancy Lynch"]) }, { runs: prose(["More words on page two."]) }],
            info: { Title: "Microsoft Word - cap.docx", Author: "Seth Gilbert" },
        });
        __setPdfJs(lib);
        const read = await readCover(appWith(new Uint8Array([37, 80, 68, 70])), file("Papers/cap.pdf"), "pdf");
        expect(read.url).toMatch(/^blob:/);
        expect(read.facts).toEqual({ chapters: 2, author: "Seth Gilbert" });
        expect(calls.rendered).toEqual([1]);
        expect(calls.getDocument[0].data).toBeInstanceOf(Uint8Array);
        expect(calls.getDocument[0].url).toBeUndefined();
        expect(calls.destroyed).toBe(1);
    });

    it("marks a PDF with no text on its first pages as a scan", async () => {
        const { lib } = makePdfJs({ pages: [{ runs: [] }, { runs: prose(["12"]) }, { runs: [] }, { runs: prose(["Text only on page four."]) }] });
        __setPdfJs(lib);
        const read = await readCover(appWith(new Uint8Array([1])), file("Papers/scan.pdf"), "pdf");
        expect(read.facts).toEqual({ chapters: 4, imageOnly: true });
        expect(isImageOnly(["A real page of prose has far more letters than this."])).toBe(false);
        expect(isImageOnly([])).toBe(false);
    });

    it("reads an EPUB's own cover, title, author and spine", async () => {
        const epub = makeEpub({
            title: "How to Take Smart Notes",
            author: "Sönke Ahrens",
            cover: new Uint8Array([137, 80, 78, 71]),
            chapters: [
                { id: "a", href: "a.xhtml", title: "One", body: "<p>One</p>" },
                { id: "b", href: "b.xhtml", title: "Two", body: "<p>Two</p>" },
            ],
        });
        // The app parses with the platform's DOMParser; node has none, so the test lends it one.
        const { parseXml } = await import("../../../../support/miniXml");
        g.DOMParser = class {
            parseFromString(text: string) {
                const parsed = parseXml(text);
                return { ...parsed, getElementsByTagName: () => [] };
            }
        };
        const read = await readCover(appWith(epub), file("Books/smart.epub"), "epub");
        expect(read.facts).toEqual({ chapters: 2, title: "How to Take Smart Notes", author: "Sönke Ahrens" });
        expect(read.url).toMatch(/^blob:/);
        expect(cachedCover(file("Books/smart.epub"))).toBe(read);
        // A changed file is read again.
        expect(cachedCover(file("Books/smart.epub", 2))).toBeUndefined();
        delete g.DOMParser;
    });

    it("gives a source it cannot read the drawn cover, never an error", async () => {
        __setPdfJs(null);
        const read = await readCover(appWith(new Uint8Array([1])), file("Papers/broken.pdf"), "pdf");
        expect(read).toEqual({ url: null, facts: { chapters: 0 } });
    });

    it("ignores what a PDF declares when it is only the name of the program that made it", () => {
        expect(declared("Microsoft Word - draft.docx")).toBeUndefined();
        expect(declared("untitled")).toBeUndefined();
        expect(declared("  Time, Clocks, and the Ordering of Events  ")).toBe("Time, Clocks, and the Ordering of Events");
        expect(declared(3)).toBeUndefined();
    });
});
