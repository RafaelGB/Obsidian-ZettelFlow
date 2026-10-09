import { describe, it, expect } from "@jest/globals";
import { DEFAULT_READER_PREFS, READER_LAYOUTS, READER_MARGINS, READER_SPACINGS, READER_WIDTHS, normalizeReaderPrefs, readerClassNames } from "architecture/components/core/reader/readerPrefs";

describe("the layout is one of your reading preferences (#753 AC-1, FR-1)", () => {
    it("reads Scroll for nothing stored, for anything unknown, and for every preference saved before it", () => {
        expect(normalizeReaderPrefs({}).layout).toBe("scroll");
        expect(normalizeReaderPrefs(undefined).layout).toBe("scroll");
        expect(normalizeReaderPrefs({ layout: "columns" }).layout).toBe("scroll");
        const before = { font: "serif", size: "large", theme: "sepia", focus: true, timeLeft: false };
        expect(normalizeReaderPrefs(before)).toEqual({ ...before, layout: "scroll", spacing: "normal", width: "medium", margins: "medium", justify: false });
        expect(DEFAULT_READER_PREFS.layout).toBe("scroll");
    });

    it("keeps Page and Spread as they were chosen", () => {
        expect(READER_LAYOUTS).toEqual(["scroll", "page", "spread"]);
        expect(normalizeReaderPrefs({ layout: "page" }).layout).toBe("page");
        expect(normalizeReaderPrefs({ layout: "spread" }).layout).toBe("spread");
    });

    it("wears nothing new in Scroll, exactly the classes of 3.6, and its layout in pages (AC-2)", () => {
        const scroll = readerClassNames({ ...DEFAULT_READER_PREFS, layout: "scroll" });
        expect(scroll.plugin).toEqual(["reader", "reader--font-sans", "reader--size-medium", "reader--theme-auto"]);
        expect(readerClassNames({ ...DEFAULT_READER_PREFS, layout: "page" }).plugin).toContain("reader--layout-page");
        expect(readerClassNames({ ...DEFAULT_READER_PREFS, layout: "spread" }).plugin).toContain("reader--layout-spread");
    });
});

describe("the type you can tune (#757 AC-1, AC-2, FR-9)", () => {
    it("reads every new field at its default for a preference saved before it", () => {
        const before = { font: "serif", size: "large", theme: "sepia", focus: true, timeLeft: false, layout: "page" };
        expect(normalizeReaderPrefs(before)).toEqual({ ...before, spacing: "normal", width: "medium", margins: "medium", justify: false });
        expect(DEFAULT_READER_PREFS).toMatchObject({ spacing: "normal", width: "medium", margins: "medium", justify: false });
    });

    it("falls back on anything unknown, and keeps every valid choice", () => {
        expect(normalizeReaderPrefs({ spacing: "loose", width: 3, margins: null, justify: "yes" })).toMatchObject({ spacing: "normal", width: "medium", margins: "medium", justify: false });
        expect(READER_SPACINGS).toEqual(["tight", "normal", "airy"]);
        expect(READER_WIDTHS).toEqual(["narrow", "medium", "wide"]);
        expect(READER_MARGINS).toEqual(["small", "medium", "large"]);
        for (const spacing of READER_SPACINGS) expect(normalizeReaderPrefs({ spacing }).spacing).toBe(spacing);
        for (const width of READER_WIDTHS) expect(normalizeReaderPrefs({ width }).width).toBe(width);
        for (const margins of READER_MARGINS) expect(normalizeReaderPrefs({ margins }).margins).toBe(margins);
        expect(normalizeReaderPrefs({ justify: true }).justify).toBe(true);
    });

    it("wears exactly the classes of 3.6 by default, and one class per choice away from it", () => {
        expect(readerClassNames(DEFAULT_READER_PREFS).plugin).toEqual(["reader", "reader--font-sans", "reader--size-medium", "reader--theme-auto"]);
        const extra = (prefs: Partial<typeof DEFAULT_READER_PREFS>) => readerClassNames({ ...DEFAULT_READER_PREFS, ...prefs }).plugin.slice(4);
        expect(extra({ spacing: "airy" })).toEqual(["reader--spacing-airy"]);
        expect(extra({ spacing: "tight" })).toEqual(["reader--spacing-tight"]);
        expect(extra({ width: "wide" })).toEqual(["reader--width-wide"]);
        expect(extra({ width: "narrow" })).toEqual(["reader--width-narrow"]);
        expect(extra({ margins: "large" })).toEqual(["reader--margins-large"]);
        expect(extra({ margins: "small" })).toEqual(["reader--margins-small"]);
        expect(extra({ justify: true })).toEqual(["reader--justify"]);
    });
});
