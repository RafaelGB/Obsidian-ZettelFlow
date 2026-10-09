import { describe, it, expect } from "@jest/globals";
import { DEFAULT_READER_PREFS, READER_LAYOUTS, normalizeReaderPrefs, readerClassNames } from "architecture/components/core/reader/readerPrefs";

describe("the layout is one of your reading preferences (#753 AC-1, FR-1)", () => {
    it("reads Scroll for nothing stored, for anything unknown, and for every preference saved before it", () => {
        expect(normalizeReaderPrefs({}).layout).toBe("scroll");
        expect(normalizeReaderPrefs(undefined).layout).toBe("scroll");
        expect(normalizeReaderPrefs({ layout: "columns" }).layout).toBe("scroll");
        const before = { font: "serif", size: "large", theme: "sepia", focus: true, timeLeft: false };
        expect(normalizeReaderPrefs(before)).toEqual({ ...before, layout: "scroll" });
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
