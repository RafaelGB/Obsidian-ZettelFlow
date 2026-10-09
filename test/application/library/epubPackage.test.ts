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
