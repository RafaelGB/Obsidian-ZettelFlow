import { describe, it, expect } from "@jest/globals";
import { hasRuledTable, isDesigned, leftOutOf, printOf, type PagePrint } from "application/library/pdfPrint";
import { cropOpsOf } from "application/library/pdfCrop";
import { PDFJS_OPS } from "../../support/pdfCropPaper";
import { LOGO, PAGE_H, PAGE_W, across, down, grid, image, opList, shape, toView } from "../../support/pdfPrintPaper";

const OPS = cropOpsOf(PDFJS_OPS)!;
const print = (...entries: Parameters<typeof opList>) => printOf(opList(...entries), OPS, toView, PAGE_W, PAGE_H)!;

describe("what a page prints besides its text (#852)", () => {
    it("keeps its pictures as shares of the page, and leaves an icon out", () => {
        const page = print(LOGO, image(100, 100, 400, 300), image(80, 500, 6, 6));
        expect(page.pictures).toHaveLength(2);
        expect(page.pictures[0].x).toBeCloseTo(470 / PAGE_W);
        expect(page.pictures[0].y).toBeCloseTo((PAGE_H - 768) / PAGE_H);
    });

    it("tells a rule from any other shape", () => {
        const page = print(across(400), down(300, 100, 600), shape(100, 100, 200, 200), shape(100, 300, 130, 300.5));
        expect(page.paths).toBe(4);
        // The square is a shape; the short dash is too short to be a rule.
        expect(page.rules).toHaveLength(2);
    });

    it("says nothing for a list it does not understand", () => {
        expect(printOf(opList([PDFJS_OPS.shadingFill, ["sh"]]), OPS, toView, PAGE_W, PAGE_H)).toBeNull();
        expect(printOf(null, OPS, toView, PAGE_W, PAGE_H)).toBeNull();
    });

    it("finds a ruled table: a grid, or rules between its rows — never a plot's axes", () => {
        expect(hasRuledTable(print(grid(600, 4, 3)))).toBe(true);
        expect(hasRuledTable(print([across(600), across(580), across(560), across(540), across(520), across(500)]))).toBe(true);
        expect(hasRuledTable(print([across(200), down(72, 200, 500)]))).toBe(false);
    });

    it("counts lines, not segments: a footer ruled as a box of three cells is no table (walked on the manual, p. 4)", () => {
        const cells = (y: number) => [across(y, 68, 218), across(y, 219, 473), across(y, 474, 568)];
        expect(hasRuledTable(print(...cells(62), ...cells(39)))).toBe(false);
        // Rows of a real table, each line cut at its columns, still are.
        expect(hasRuledTable(print(...[600, 580, 560, 540, 520, 500].flatMap(cells)))).toBe(true);
    });

    it("takes the frame drawn around a screenshot for the picture's, never a table (walked on the manual, p. 6)", () => {
        const framed = (y: number) => [image(100, y, 300, 150), across(y, 100, 400), across(y + 150, 100, 400), down(100, y, y + 150), down(400, y, y + 150)];
        const page = print(...framed(450), ...framed(150));
        expect(page.rules).toHaveLength(0);
        expect(hasRuledTable(page)).toBe(false);
    });
});

describe("a designed document opens as printed (#852 FR-1, AC-1)", () => {
    const prose: PagePrint = { pictures: [], rules: [], paths: 0 };

    it("is designed with the same logo in the same place on its pages", () => {
        expect(isDesigned([print(LOGO), print(LOGO), print(LOGO)])).toBe(true);
        expect(isDesigned([print(LOGO), print(LOGO), prose])).toBe(true);
    });

    it("is not, for a paper with a figure or two in different places", () => {
        expect(isDesigned([prose, print(image(72, 400, 300, 200)), print(image(150, 100, 300, 250))])).toBe(false);
        expect(isDesigned([prose, prose, prose])).toBe(false);
        // One page with a logo is not page after page.
        expect(isDesigned([print(LOGO)])).toBe(false);
    });

    it("is designed with a page that is mostly one picture — not with a ruled table, which papers have too", () => {
        expect(isDesigned([print(image(0, 0, PAGE_W, PAGE_H * 0.7))])).toBe(true);
        expect(isDesigned([prose, print(grid(600, 5, 4)), prose])).toBe(false);
        // A paper's large figure is not the page.
        expect(isDesigned([prose, print(image(72, 200, 468, 400))])).toBe(false);
    });

    it("says nothing from pages it could not read", () => {
        expect(isDesigned([null, null])).toBe(false);
        expect(isDesigned([])).toBe(false);
    });
});

describe("what the reading view leaves out of a page (#852 FR-2)", () => {
    it("counts its pictures, and says when it has a ruled table", () => {
        expect(leftOutOf(print(LOGO, image(100, 100, 400, 300)))).toEqual({ pictures: 2, tables: false });
        expect(leftOutOf(print(grid(600, 4, 3)))).toEqual({ pictures: 0, tables: true });
    });

    it("leaves out nothing an island shows: its pictures, and a plot's gridlines (#854)", () => {
        const page = print(image(100, 100, 400, 300), [700, 650, 600, 550, 500, 450].map((y) => across(y)));
        // The picture is shown; the six lines across, above it, are not: a ruled table left out.
        const picture = { box: { x: 0.1, y: 0.45, w: 0.8, h: 0.5 }, island: "figure" as const };
        expect(leftOutOf(page, [picture])).toEqual({ pictures: 0, tables: true });
        // Shown too, as a plot's gridlines: nothing is left out.
        expect(leftOutOf(page, [picture, { box: { x: 0, y: 0, w: 1, h: 0.45 }, island: "figure" }])).toBeNull();
    });

    it("is nothing for a page of prose, or one it could not read", () => {
        expect(leftOutOf(print(across(400)))).toBeNull();
        expect(leftOutOf(null)).toBeNull();
    });
});
