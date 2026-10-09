import { describe, it, expect } from "@jest/globals";
import { parsePackage } from "application/library/epubPackage";
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
