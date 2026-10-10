import { describe, it, expect } from "@jest/globals";
import { DARK_PAGE_LUMINANCE, parseComputedColour, relativeLuminance, toneOf, toneOfBackground, toneOfLayers, toneOfPixels } from "application/reader/ink/inkTone";

const pixels = (rgba: [number, number, number, number], n = 4) => Array.from({ length: n }, () => rgba).flat();

describe("the tone of a printed page (ink that reads on dark pages)", () => {
    it("measures luminance as WCAG 2 does", () => {
        expect(relativeLuminance(0, 0, 0)).toBe(0);
        expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 6);
        expect(relativeLuminance(128, 128, 128)).toBeCloseTo(0.2158, 3);
    });

    it("calls a page dark where white ink would contrast more than black", () => {
        expect(toneOf(DARK_PAGE_LUMINANCE - 0.001)).toBe("dark");
        expect(toneOf(DARK_PAGE_LUMINANCE)).toBe("light");
    });

    it("reads a page's pixels: white paper is light, a black design is dark, an empty canvas is paper", () => {
        expect(toneOfPixels(pixels([255, 255, 255, 255]))).toBe("light");
        expect(toneOfPixels(pixels([12, 14, 20, 255]))).toBe("dark");
        expect(toneOfPixels(pixels([0, 0, 0, 0]))).toBe("light");
        expect(toneOfPixels([])).toBeNull();
    });

    it("weighs the whole page: a dark page with a little white type is still dark", () => {
        const page = [...pixels([10, 10, 10, 255], 9), ...pixels([255, 255, 255, 255], 1)];
        expect(toneOfPixels(page)).toBe("dark");
    });

    it("reads a computed background, and says nothing of a transparent one", () => {
        expect(parseComputedColour("rgba(1, 2, 3, 0.5)")).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
        expect(parseComputedColour("rgb(1 2 3 / 40%)")).toEqual({ r: 1, g: 2, b: 3, a: 0.4 });
        expect(toneOfBackground("rgb(0, 0, 0)")).toBe("dark");
        expect(toneOfBackground("rgb(250, 248, 240)")).toBe("light");
        expect(toneOfBackground("rgba(0, 0, 0, 0)")).toBeNull();
        expect(toneOfBackground("transparent")).toBeNull();
    });

    it("looks at a designed page over a grid: the layer on top at each point, the paper where none is", () => {
        const page = { left: 0, top: 0, width: 600, height: 800 };
        expect(toneOfLayers(page, [])).toBe("light");
        expect(toneOfLayers(page, [{ box: page, luminance: 1 }, { box: page, luminance: 0.02 }])).toBe("dark");
        // Paint order: the last layer covering a point is the one seen.
        expect(toneOfLayers(page, [{ box: page, luminance: 0.02 }, { box: page, luminance: 1 }])).toBe("light");
        // Dark panels over most of a light page.
        const panels = [{ box: page, luminance: 1 }, { box: { left: 0, top: 0, width: 600, height: 700 }, luminance: 0.03 }];
        expect(toneOfLayers(page, panels)).toBe("dark");
        expect(toneOfLayers({ left: 0, top: 0, width: 0, height: 0 }, panels)).toBeNull();
    });
});
