import { describe, it, expect } from "@jest/globals";
import {
    BOOKMARK_CHARS,
    BOOKMARKS_PER_BOOK,
    addBookmark,
    bookmarkAt,
    bookmarkSnippet,
    bookmarksIn,
    inReadingOrder,
    landingOffset,
    normalizeBookmarks,
    removeBookmarks,
    wordStart,
} from "architecture/components/core/reader/readerBookmarks";
import { chapterText, offsetAt, pointAt } from "architecture/components/core/reader/readerMarks";
import { FakeEl } from "../../../../support/textDom";

const TEXT =
    "The mind has two systems. System 1 runs automatically and quickly, with little or no effort. " +
    "System 2 allocates attention to the effortful mental activities that demand it, including complex computations.";

describe("a bookmark is a place (#761 AC-1)", () => {
    it("keeps the chapter, the offset of its first words and about 80 characters of them", () => {
        const at = TEXT.indexOf("System 2");
        const b = bookmarkAt(TEXT, 3, at, 1000);
        expect(b).toMatchObject({ chapter: 3, offset: at, at: 1000 });
        expect(b.quote?.exact.startsWith("System 2 allocates")).toBe(true);
        expect(b.quote?.exact.length).toBeLessThanOrEqual(BOOKMARK_CHARS);
        expect(bookmarkSnippet(b)).toBe(b.quote?.exact);
    });

    it("starts at the words, never at the space before them", () => {
        const at = TEXT.indexOf(" System 1");
        expect(bookmarkAt(TEXT, 0, at, 1).offset).toBe(at + 1);
    });

    it("is a page with no words where there is no text (a PDF's Page view, FR-5)", () => {
        expect(bookmarkAt("", 41, 0, 5)).toEqual({ chapter: 41, offset: 0, at: 5 });
    });

    it("is found for a screen that holds it, and not for one that does not", () => {
        const list = [bookmarkAt(TEXT, 2, 30, 1)];
        expect(bookmarksIn(list, 2, 0, 100)).toHaveLength(1);
        expect(bookmarksIn(list, 2, 31, 100)).toHaveLength(0);
        expect(bookmarksIn(list, 3, 0, 100)).toHaveLength(0);
    });

    it("is added once per place, removed alone, and listed in reading order", () => {
        const a = bookmarkAt(TEXT, 5, 10, 3);
        const b = bookmarkAt(TEXT, 1, 80, 2);
        const c = bookmarkAt(TEXT, 1, 20, 1);
        let list = addBookmark(addBookmark(addBookmark([], a), b), c);
        list = addBookmark(list, { ...a, at: 9 });
        expect(list.map((x) => [x.chapter, x.offset])).toEqual([
            [1, c.offset],
            [1, b.offset],
            [5, a.offset],
        ]);
        expect(c.offset).toBeLessThan(b.offset);
        expect(removeBookmarks(list, [b]).map((x) => x.offset)).toEqual([c.offset, a.offset]);
        expect(inReadingOrder([a, b, c])[0]).toBe(c);
    });

    it("keeps at most 200 a book, forgetting the oldest", () => {
        let list = [] as ReturnType<typeof addBookmark>;
        for (let i = 0; i < BOOKMARKS_PER_BOOK + 5; i++) list = addBookmark(list, { chapter: i, offset: 0, at: 100 + i });
        expect(list).toHaveLength(BOOKMARKS_PER_BOOK);
        expect(list[0].chapter).toBe(5);
    });

    it("reads a stored list back, dropping anything malformed", () => {
        const good = bookmarkAt(TEXT, 2, 30, 7);
        const read = normalizeBookmarks([
            good,
            { chapter: 1, offset: 0, at: 8 },
            { chapter: "1", offset: 0, at: 1 },
            { chapter: 1, at: 1 },
            { chapter: 1, offset: 0 },
            { chapter: -1, offset: 0, at: 1 },
            { chapter: 1, offset: 0, at: 2, quote: { exact: "", prefix: "", suffix: "" } },
            null,
            "bookmark",
        ]);
        expect(read).toEqual([{ chapter: 1, offset: 0, at: 2 }, { chapter: 1, offset: 0, at: 8 }, good]);
        expect(normalizeBookmarks({ not: "a list" })).toEqual([]);
    });
});

describe("a place that survives the type (#761 FR-3, AC-2 place)", () => {
    it("lands on the same words after the text moved, by its words before its offset", () => {
        const b = bookmarkAt(TEXT, 0, TEXT.indexOf("System 2"), 1);
        // A chapter that gained a preface since (an image's caption arriving, a re-drawn page).
        const moved = `A preface of some length. ${TEXT}`;
        expect(landingOffset(moved, b)).toBe(moved.indexOf("System 2"));
        // Words gone: the offset, kept inside the text.
        expect(landingOffset("short", b)).toBe(5);
    });

    it("is the same line whichever blocks the text is drawn in (a change of size, of layout)", () => {
        const wide = new FakeEl("div", [new FakeEl("p", [TEXT])]);
        const at = TEXT.indexOf("System 2");
        const b = bookmarkAt(chapterText(wide as never), 0, at, 1);
        // The same chapter, re-flowed into short blocks with a link in the middle.
        const split = TEXT.indexOf("attention");
        const narrow = new FakeEl("div", [
            new FakeEl("p", [TEXT.slice(0, at)]),
            new FakeEl("p", [TEXT.slice(at, split), new FakeEl("a", ["attention"]), TEXT.slice(split + "attention".length)]),
        ]);
        const landing = landingOffset(chapterText(narrow as never), b);
        const point = pointAt(narrow as never, landing);
        expect(point?.node.data.startsWith("System 2")).toBe(true);
        expect(offsetAt(narrow as never, point?.node ?? null, point?.offset)).toBe(landing);
    });

    it("reads an element's place as the first text in it, and nothing outside the chapter", () => {
        const second = new FakeEl("p", ["Second block."]);
        const root = new FakeEl("div", [new FakeEl("p", ["First. "]), second]);
        expect(offsetAt(root as never, second as never, 0)).toBe("First. ".length);
        expect(offsetAt(root as never, root as never, 1)).toBe("First. ".length);
        expect(offsetAt(root as never, new FakeEl("p", ["elsewhere"]) as never, 0)).toBeNull();
        expect(pointAt(root as never, 999)?.offset).toBe("Second block.".length);
    });
});

describe("a place starts where its words start (#761, found in the walk)", () => {
    it("snaps a caret a letter or two into a word back to the word's start, never across a block", () => {
        const text = "first block.Second block holds words";
        expect(wordStart(text, text.indexOf("olds"))).toBe(text.indexOf("holds"));
        expect(wordStart(text, text.indexOf("holds"))).toBe(text.indexOf("holds"));
        // The start of a block with no space before it stays where it is.
        expect(wordStart(text, text.indexOf("Second"))).toBe(text.indexOf("Second"));
        expect(bookmarkAt(text, 0, text.indexOf("olds"), 1).quote?.exact.startsWith("holds")).toBe(true);
    });

    it("lands on the nearest of two identical passages: a refrain is found where it was kept", () => {
        const refrain = "and the sea was the sea again, as it always had been. ";
        const text = refrain.repeat(6);
        const b = bookmarkAt(text, 0, refrain.length * 4, 1);
        expect(landingOffset(text, b)).toBe(refrain.length * 4);
    });
});
