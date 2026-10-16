import { describe, it, expect } from "@jest/globals";
import { SPINE_MAX, SPINE_MIN, spineHeight, spineWidth } from "application/library/spine";

describe("a book turned spine-out (#820 AC-20)", () => {
    it("is thicker the longer the book, within the bounds", () => {
        const thick = spineWidth({ format: "pdf", chapters: 400 });
        const thin = spineWidth({ format: "pdf", chapters: 40 });
        expect(thick).toBeGreaterThan(thin);
        for (const width of [thick, thin]) {
            expect(width).toBeGreaterThanOrEqual(SPINE_MIN);
            expect(width).toBeLessThanOrEqual(SPINE_MAX);
        }
    });

    it("is of middling thickness before its length is read, and clamps the extremes", () => {
        expect(spineWidth({ format: "epub" })).toBeCloseTo((SPINE_MIN + SPINE_MAX) / 2, 2);
        expect(spineWidth({ format: "pdf", chapters: 1 })).toBe(SPINE_MIN);
        expect(spineWidth({ format: "pdf", chapters: 100_000 })).toBe(SPINE_MAX);
    });

    it("reads each format's length its own way: 30 spine items are a long book, 30 pages a paper", () => {
        expect(spineWidth({ format: "epub", chapters: 30 })).toBeGreaterThan(spineWidth({ format: "pdf", chapters: 30 }));
        expect(spineWidth({ format: "path", chapters: 10 })).toBeGreaterThan(spineWidth({ format: "article", chapters: 10 }));
    });

    it("stands the same height every time, never taller than a cover", () => {
        expect(spineHeight("Books/a.epub")).toBe(spineHeight("Books/a.epub"));
        expect(spineHeight("Books/a.epub")).not.toBe(spineHeight("Books/b.epub"));
        for (const id of ["x", "Books/a.epub", "Papers/long name.pdf", "path:r1"]) {
            expect(spineHeight(id)).toBeGreaterThanOrEqual(0.88);
            expect(spineHeight(id)).toBeLessThanOrEqual(1);
        }
    });
});
