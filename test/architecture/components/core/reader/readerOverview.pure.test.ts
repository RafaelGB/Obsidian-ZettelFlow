import { describe, it, expect } from "@jest/globals";
import {
    CARD_DPR_MAX,
    OVERVIEW_LIMITS,
    cardMarks,
    cardPixels,
    cardProgress,
    normalizeContentsTab,
    overviewLimit,
    overviewUnits,
    releaseFarthest,
} from "architecture/components/core/reader/readerOverview";
import { normalizeLibrary, withFacts, withRead } from "application/library/sourceMeta";

/**
 * **The overview's rules** (#776): which card a part of the book gets, the marks it carries (never a
 * number), its hairline, how small its picture is, and how many are held — without a DOM.
 */

const flowing = (n: number) => ({ format: "epub", chapters: Array.from({ length: n }, (_, i) => ({ label: `Ch. ${i + 1}` })) });

describe("the cards, one per part of the book, in reading order (AC-4, FR-5, FR-7, FR-8, D1–D4)", () => {
    it("gives a flowing book one chapter card per spine item, named as Contents names it", () => {
        const book = { ...flowing(10), toc: [{ title: "The lazy controller", chapter: 2, depth: 0 }, { title: "A section", chapter: 2, depth: 1 }, { title: "Inside", chapter: 4, depth: 1 }] };
        const { units, rtl } = overviewUnits(book);
        expect(units).toHaveLength(10);
        expect(units.every((unit) => unit.kind === "chapter")).toBe(true);
        expect(units[2].label).toBe("The lazy controller");
        expect(units[4].label).toBe("Inside");
        expect(units[0].label).toBe("Ch. 1");
        expect(rtl).toBe(false);
    });

    it("gives a designed book one page card per page, labelled as the book numbers them", () => {
        const { units } = overviewUnits({ format: "epub", designed: true, chapters: ["1", "2", "3", "4"].map((label) => ({ label, designed: true as const })) });
        expect(units.map((unit) => [unit.kind, unit.label])).toEqual([["page", "1"], ["page", "2"], ["page", "3"], ["page", "4"]]);
    });

    it("shows each part of a mixed book as itself", () => {
        const { units } = overviewUnits({ format: "epub", chapters: [{ label: "Ch. 1" }, { label: "p. 2", designed: true }, { label: "Ch. 3" }] });
        expect(units.map((unit) => unit.kind)).toEqual(["chapter", "page", "chapter"]);
    });

    it("gives a paper one page card per page, with its own labels", () => {
        const { units } = overviewUnits({ format: "pdf", chapters: ["p. i", "p. 1", "p. 2", "p. 3", "p. 4", "p. 5", "p. 6", "p. 7"].map((label) => ({ label })) });
        expect(units.map((unit) => unit.label)).toEqual(["p. i", "p. 1", "p. 2", "p. 3", "p. 4", "p. 5", "p. 6", "p. 7"]);
        expect(units.every((unit) => unit.kind === "page")).toBe(true);
    });

    it("says when the book reads from the right", () => {
        expect(overviewUnits({ ...flowing(2), direction: "rtl" }).rtl).toBe(true);
    });
});

describe("marks, never numbers (AC-6, FR-9, D9, P2)", () => {
    const text = "One sentence here. Another sentence there. A third sentence at the end of it all.";

    it("makes two highlights at one place one tick, and two colours two", () => {
        const marks = [
            { at: 3, meaning: "idea" as const, quote: "Another sentence" },
            { at: 3, meaning: "idea" as const, quote: "Another sentence there" },
            { at: 3, meaning: "question" as const, quote: "Another sentence" },
        ];
        const card = cardMarks(marks, [], 3, text);
        expect(card.ticks.map((tick) => tick.meaning)).toEqual(["idea", "question"]);
        expect(card.ticks[0].at).toBeCloseTo(text.indexOf("Another") / text.length, 2);
    });

    it("puts a tick where its words are, and one per colour at the edge when the text is not known", () => {
        const marks = [
            { at: 1, meaning: "idea" as const, quote: "One sentence" },
            { at: 1, meaning: "idea" as const, quote: "A third sentence" },
        ];
        expect(cardMarks(marks, [], 1, text).ticks).toHaveLength(2);
        expect(cardMarks(marks, [], 1).ticks).toEqual([{ meaning: "idea", at: null }]);
    });

    it("reads an absent meaning as an idea, shows ink as a pen and a bookmark as the ribbon", () => {
        const card = cardMarks([{ at: 2, quote: "x" }, { at: 2, ink: true }], [{ chapter: 2 }, { chapter: 5 }], 2);
        expect(card).toEqual({ ticks: [{ meaning: "idea", at: null }], pen: true, ribbon: true });
        expect(cardMarks([{ at: 2, ink: true }], [], 2).ticks).toEqual([]);
    });

    it("shows a paper's highlight made in the reading view on its page's card", () => {
        expect(cardMarks([{ at: 3, meaning: "quote", quote: "a line" }], [], 3).ticks).toEqual([{ meaning: "quote", at: null }]);
        expect(cardMarks([{ at: 3, meaning: "quote", quote: "a line" }], [], 2).ticks).toEqual([]);
    });

    it("shows nothing on a card without marks", () => {
        expect(cardMarks([], [], 0)).toEqual({ ticks: [], pen: false, ribbon: false });
    });
});

describe("a chapter's hairline (AC-7, D10)", () => {
    const chapter = (index: number) => ({ index, kind: "chapter" as const, label: "x" });
    it("is filled to your place in the chapter you are in, filled when read, empty otherwise", () => {
        const read = new Set([0]);
        expect(cardProgress(chapter(1), 1, 0.5, read)).toBe(0.5);
        expect(cardProgress(chapter(0), 1, 0.5, read)).toBe(1);
        expect(cardProgress(chapter(3), 1, 0.5, read)).toBe(0);
        expect(cardProgress(chapter(1), 1, 2, read)).toBe(1);
    });

    it("is not on a page", () => {
        expect(cardProgress({ index: 0, kind: "page", label: "p. 1" }, 0, 0.5, new Set())).toBeNull();
    });
});

describe("small pictures are small, and few are held (AC-13, AC-12, FR-17, FR-18, D16)", () => {
    it("draws a card at its size times the screen's density, capped", () => {
        expect(cardPixels(96, 124, 3)).toEqual({ width: 192, height: 248 });
        expect(cardPixels(96, 124, 1)).toEqual({ width: 96, height: 124 });
        expect(cardPixels(96, 124, Number.NaN)).toEqual({ width: 96, height: 124 });
        expect(CARD_DPR_MAX).toBe(2);
    });

    it("lets go the farthest from the card last seen once past the cap", () => {
        expect(releaseFarthest([0, 1, 2, 3, 4], 3, 4)).toEqual([0, 1]);
        expect(releaseFarthest([10, 11, 12, 40], 3, 11)).toEqual([40]);
        expect(releaseFarthest([1, 2], 3, 1)).toEqual([]);
        // A card in view is never let go, even past the cap.
        expect(releaseFarthest([0, 1, 2, 3], 2, 2, new Set([0, 1, 2, 3]))).toEqual([]);
        expect(releaseFarthest([0, 1, 2, 3, 9], 3, 2, new Set([1, 2, 3]))).toEqual([9, 0]);
    });

    it("holds fewer on a phone or an iPad than on a desktop", () => {
        expect(overviewLimit(true)).toBe(OVERVIEW_LIMITS.mobile.pictures);
        expect(overviewLimit(false)).toBe(OVERVIEW_LIMITS.desktop.pictures);
        expect(OVERVIEW_LIMITS.mobile.pictures).toBeLessThan(OVERVIEW_LIMITS.desktop.pictures);
    });
});

describe("the tab, as it was kept (#776 D7, #784 FR-2)", () => {
    it("reads an old Overview or #767's Pages as Contents: the overview is its own panel now", () => {
        expect(normalizeContentsTab("pages")).toBe("contents");
        expect(normalizeContentsTab("overview")).toBe("contents");
        expect(normalizeContentsTab("bookmarks")).toBe("bookmarks");
        expect(normalizeContentsTab("trail")).toBe("trail");
        expect(normalizeContentsTab("nonsense")).toBe("contents");
    });
});

describe("the chapters read to their end (P1)", () => {
    it("keeps each once, in order, within the book, through a new copy of the file", () => {
        let map = normalizeLibrary({ "Books/a.epub": { size: 1, mtime: 1, chapters: 4 } });
        map = withRead(map, "Books/a.epub", 2, 4);
        map = withRead(map, "Books/a.epub", 0, 4);
        expect(withRead(map, "Books/a.epub", 2, 4)).toBe(map);
        map = withRead(map, "Books/a.epub", 9, 4);
        expect(map["Books/a.epub"].read).toEqual([0, 2]);
        const again = normalizeLibrary({ "Books/a.epub": { size: 1, mtime: 1, chapters: 4, read: [3, 3, -1, 1.5, "2", 0] } });
        expect(again["Books/a.epub"].read).toEqual([0, 3]);
        expect(withFacts(map, "Books/a.epub", { chapters: 4 }, 2, 2)["Books/a.epub"].read).toEqual([0, 2]);
    });
});
