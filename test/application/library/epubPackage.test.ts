import { describe, it, expect } from "@jest/globals";
import { parsePackage } from "application/library/epubPackage";
import { DEFAULT_PAGE, layoutOf, pageSize, pairSpreads, spreadSide, svgPageSize, viewportOf } from "application/library/epubFixedLayout";
import { miniParse } from "../../support/miniXml";

const parse = miniParse as unknown as Parameters<typeof parsePackage>[2];

const opf = (spine: string) =>
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata/><manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest>${spine}</package>`;

describe("the direction a book reads in (#753 FR-10)", () => {
    it("reads a right-to-left spine as rtl", () => {
        const pkg = parsePackage(opf('<spine page-progression-direction="rtl"><itemref idref="c1"/></spine>'), "OEBPS/content.opf", parse);
        expect(pkg.direction).toBe("rtl");
    });

    it("says nothing when the book does not, or says default", () => {
        expect("direction" in parsePackage(opf('<spine><itemref idref="c1"/></spine>'), "OEBPS/content.opf", parse)).toBe(false);
        expect("direction" in parsePackage(opf('<spine page-progression-direction="default"><itemref idref="c1"/></spine>'), "OEBPS/content.opf", parse)).toBe(false);
    });
});

describe("the language a book is written in (#757 AC-3)", () => {
    const withMeta = (metadata: string) =>
        `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="3.0"><metadata>${metadata}</metadata><manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`;

    it("reads dc:language, the first one when there are several", () => {
        expect(parsePackage(withMeta("<dc:title>Niebla</dc:title><dc:language> es </dc:language><dc:language>en</dc:language>"), "OEBPS/content.opf", parse).language).toBe("es");
    });

    it("says nothing for a book that declares none, or declares something that is not a language", () => {
        expect("language" in parsePackage(withMeta("<dc:title>x</dc:title>"), "OEBPS/content.opf", parse)).toBe(false);
        expect("language" in parsePackage(withMeta("<dc:language>not a tag</dc:language>"), "OEBPS/content.opf", parse)).toBe(false);
    });
});

describe("a fixed-layout book, known by what it says (#771 AC-1)", () => {
    const book = (meta: string, itemrefs: string) =>
        `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata>${meta}</metadata><manifest><item id="p1" href="p1.xhtml" media-type="application/xhtml+xml"/><item id="p2" href="p2.xhtml" media-type="application/xhtml+xml"/><item id="p3" href="p3.svg" media-type="image/svg+xml"/></manifest><spine>${itemrefs}</spine></package>`;
    const all = '<itemref idref="p1"/><itemref idref="p2"/>';

    it("reads the book's own rendition:layout, spread, orientation and viewport", () => {
        const pkg = parsePackage(
            book('<meta property="rendition:layout">pre-paginated</meta><meta property="rendition:spread">landscape</meta><meta property="rendition:orientation">auto</meta><meta property="rendition:viewport">width=1200, height=1600</meta>', all),
            "OEBPS/content.opf",
            parse
        );
        expect(pkg.rendition).toEqual({ layout: "pre-paginated", spread: "landscape", orientation: "auto", viewport: "width=1200, height=1600" });
        expect(pkg.spine.map((item) => layoutOf(pkg, item))).toEqual(["pre-paginated", "pre-paginated"]);
        expect(pageSize(null, pkg)).toEqual({ width: 1200, height: 1600 });
    });

    it("lets a page's own declaration win over the book's, both ways", () => {
        const fixed = parsePackage(book('<meta property="rendition:layout">pre-paginated</meta>', '<itemref idref="p1" properties="rendition:layout-reflowable"/><itemref idref="p2"/>'), "OEBPS/content.opf", parse);
        expect(fixed.spine.map((item) => layoutOf(fixed, item))).toEqual(["reflowable", "pre-paginated"]);
        const flowing = parsePackage(book("", '<itemref idref="p1"/><itemref idref="p2" properties="rendition:layout-pre-paginated page-spread-right"/>'), "OEBPS/content.opf", parse);
        expect(flowing.spine.map((item) => layoutOf(flowing, item))).toEqual(["reflowable", "pre-paginated"]);
        expect(flowing.spine[1].properties).toEqual(["rendition:layout-pre-paginated", "page-spread-right"]);
    });

    it("reads a book that declares nothing as flowing, exactly as before", () => {
        const pkg = parsePackage(book("", all), "OEBPS/content.opf", parse);
        expect("rendition" in pkg).toBe(false);
        expect(pkg.spine.every((item) => !("properties" in item))).toBe(true);
        expect(pkg.spine.map((item) => layoutOf(pkg, item))).toEqual(["reflowable", "reflowable"]);
    });

    it("reads the older fixed-layout meta, and ignores a meta that refines one item", () => {
        expect(parsePackage(book('<meta name="fixed-layout" content="true"/>', all), "OEBPS/content.opf", parse).rendition?.layout).toBe("pre-paginated");
        expect(parsePackage(book('<meta property="rendition:layout" refines="#p1">pre-paginated</meta>', all), "OEBPS/content.opf", parse).rendition).toBeUndefined();
    });

    it("keeps an SVG page in the spine", () => {
        const pkg = parsePackage(book("", '<itemref idref="p3"/>'), "OEBPS/content.opf", parse);
        expect(pkg.spine.map((item) => item.href)).toEqual(["OEBPS/p3.svg"]);
    });
});

describe("a designed page's size (#771 AC-1)", () => {
    it("reads the viewport however it is written", () => {
        for (const content of ["width=600, height=800", "width=600,height=800", "width=600px; height=800px", "height=800, width=600"]) {
            expect(viewportOf(content)).toEqual({ width: 600, height: 800 });
        }
    });

    it("says nothing for a viewport without both sides, or out of bounds", () => {
        expect(viewportOf("width=device-width, initial-scale=1")).toBeNull();
        expect(viewportOf("width=600")).toBeNull();
        expect(viewportOf("width=0, height=800")).toBeNull();
        expect(viewportOf("width=99999, height=800")).toBeNull();
    });

    it("reads an SVG page's viewBox, else its width and height", () => {
        const svg = (attrs: Record<string, string>) => ({ nodeType: 1, nodeName: "svg", childNodes: [], getAttribute: (n: string) => attrs[n] ?? null });
        expect(svgPageSize(svg({ viewBox: "0 0 600 800" }))).toEqual({ width: 600, height: 800 });
        expect(svgPageSize(svg({ width: "300", height: "400" }))).toEqual({ width: 300, height: 400 });
        expect(svgPageSize(svg({}))).toBeNull();
    });

    it("gives a page that declares no size the default, 768 x 1024", () => {
        expect(pageSize(null, {})).toEqual(DEFAULT_PAGE);
        expect(DEFAULT_PAGE).toEqual({ width: 768, height: 1024 });
        expect(pageSize({ width: 600, height: 800 }, { rendition: { viewport: "width=1, height=2" } })).toEqual({ width: 600, height: 800 });
    });
});

describe("spreads as the book pairs them (#771 AC-2)", () => {
    const ltr = { direction: "ltr" as const, spread: "auto" as const, landscape: true, explicit: false };
    const pages = (views: { pages: number[] }[]) => views.map((view) => view.pages);

    it("opens a first page declared right alone, then pairs left and right", () => {
        const views = pairSpreads(["right", "left", "right", "left", "right"], ltr);
        expect(pages(views)).toEqual([[0], [1, 2], [3, 4]]);
        expect(views[0].side).toBe("right");
    });

    it("mirrors in a right-to-left book: the first slot is the right page", () => {
        const views = pairSpreads(["left", "right", "left", "right", "left"], { ...ltr, direction: "rtl" });
        expect(pages(views)).toEqual([[0], [1, 2], [3, 4]]);
        expect(views[0].side).toBe("left");
    });

    it("lets a centred page stand alone, centred", () => {
        const views = pairSpreads([undefined, undefined, "center", undefined, undefined], ltr);
        expect(pages(views)).toEqual([[0, 1], [2], [3, 4]]);
        expect(views[1].side).toBeUndefined();
    });

    it("never pairs a book that says none; pairs a landscape-only book only in landscape", () => {
        expect(pages(pairSpreads([undefined, undefined], { ...ltr, spread: "none", explicit: true }))).toEqual([[0], [1]]);
        expect(pages(pairSpreads([undefined, undefined], { ...ltr, spread: "landscape", landscape: false, explicit: true }))).toEqual([[0], [1]]);
        expect(pages(pairSpreads([undefined, undefined], { ...ltr, spread: "landscape", landscape: true }))).toEqual([[0, 1]]);
    });

    it("lets an explicit Spread win over a portrait reading; the orientation decides otherwise", () => {
        expect(pages(pairSpreads([undefined, undefined], { ...ltr, landscape: false, explicit: true }))).toEqual([[0, 1]]);
        expect(pages(pairSpreads([undefined, undefined], { ...ltr, landscape: false, explicit: false }))).toEqual([[0], [1]]);
    });

    it("reads the side with or without the rendition: prefix", () => {
        expect(spreadSide({ properties: ["rendition:page-spread-left"] })).toBe("left");
        expect(spreadSide({ properties: ["page-spread-right"] })).toBe("right");
        expect(spreadSide({ properties: ["rendition:page-spread-center"] })).toBe("center");
        expect(spreadSide({})).toBeUndefined();
    });
});
