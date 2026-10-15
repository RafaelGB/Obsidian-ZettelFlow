import { describe, it, expect } from "@jest/globals";
import { marksSaid, placeOf, scrubSpans, scrubberModel, stopAt } from "architecture/components/core/reader/readerScrubber";

describe("the book at a glance: the model (#813 FR-2 – FR-8)", () => {
    it("lays each chapter out by its weight, the unknown ones at the average", () => {
        const spans = scrubSpans([100, 300, undefined]);
        expect(spans.map((s) => [s.start, s.end])).toEqual([
            [0, 100 / 600],
            [100 / 600, 400 / 600],
            [400 / 600, 1],
        ]);
        expect(scrubSpans([undefined, undefined]).map((s) => s.end)).toEqual([0.5, 1]);
    });

    it("ticks where a chapter begins — none for a book counted in pages (FR-3)", () => {
        expect(scrubberModel({ weights: [1, 1, 2], marks: [], bookmarks: [] }).ticks).toEqual([0.25, 0.5]);
        expect(scrubberModel({ weights: [1, 1, 2], pages: true, marks: [], bookmarks: [] }).ticks).toEqual([]);
    });

    it("shades the chapters you marked by how much, in the meaning you used most (FR-4, FR-5)", () => {
        const model = scrubberModel({
            weights: [1, 1, 1, 1],
            marks: [{ at: 1, meaning: "question" }, { at: 1, meaning: "question" }, { at: 1, meaning: "idea" }, { at: 3 }, { at: 9 }],
            bookmarks: [],
        });
        expect(model.bands.map((b) => [b.chapter, b.meaning, Math.round(b.density * 100) / 100])).toEqual([
            [1, "question", 1],
            [3, "idea", 0.33],
        ]);
    });

    it("puts your bookmarks where they are, in order, and skips one in no chapter (FR-6)", () => {
        const model = scrubberModel({ weights: [1, 1], marks: [], bookmarks: [{ chapter: 1, share: 0.5 }, { chapter: 0 }, { chapter: 5 }] });
        expect(model.bookmarks).toEqual([0, 0.75]);
    });

    it("finds the chapter under a place on the line, and the line under a place in a chapter (FR-10)", () => {
        const spans = scrubSpans([1, 3]);
        expect(stopAt(spans, 0.1)).toBe(0);
        expect(stopAt(spans, 0.25)).toBe(1);
        expect(stopAt(spans, 1)).toBe(1);
        expect(stopAt(spans, -1)).toBe(0);
        expect(stopAt(spans, placeOf(spans, 1, 0.4))).toBe(1);
        expect(placeOf(spans, 1, 0)).toBe(0.25);
    });

    it("says how much you marked in words, never a number (FR-7)", () => {
        expect([0, 1, 2, 40].map(marksSaid)).toEqual(["none", "one", "some", "some"]);
    });

    it("draws the same line from the same book, every time", () => {
        const input = { weights: [3, 1, 2], marks: [{ at: 2, meaning: "quote" as const }], bookmarks: [{ chapter: 1 }] };
        expect(scrubberModel(input)).toEqual(scrubberModel(input));
    });
});
