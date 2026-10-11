import { describe, it, expect } from "@jest/globals";
import {
    SURVIVED_MIN_MS,
    SURVIVED_MIN_PAGES,
    SURVIVED_MIN_WORDS,
    SURVIVED_SKIP_MS,
    SittingClock,
    chapterEnds,
    endingAt,
    shouldPause,
    spanOf,
    touchedNotes,
    wasSkip,
    type PauseFacts,
    type TurnHow,
} from "architecture/components/core/reader/readerSurvived";

/** All eight conditions hold. */
const ALL: PauseFacts = {
    how: "read",
    end: { start: 3, end: 3, words: 4200 },
    last: false,
    sittingMs: 5 * 60_000,
    marks: 2,
    skipPending: false,
    listening: false,
    enabled: true,
};

describe("what survived: the rule (#755 AC-1)", () => {
    it("pauses when all eight conditions hold", () => {
        expect(shouldPause(ALL)).toEqual({ pause: true, reason: "pause", spendSkip: false });
    });

    it.each<TurnHow>(["jump", "search", "back", "resume", "deeplink"])("never pauses on a %s", (how) => {
        expect(shouldPause({ ...ALL, how }).pause).toBe(false);
    });

    it("never pauses on a chapter too short to be one", () => {
        expect(shouldPause({ ...ALL, end: { start: 3, end: 3, words: SURVIVED_MIN_WORDS - 1 } }).pause).toBe(false);
        expect(shouldPause({ ...ALL, end: { start: 3, end: 3, words: SURVIVED_MIN_WORDS } }).pause).toBe(true);
        expect(shouldPause({ ...ALL, end: { start: 3, end: 4, pages: SURVIVED_MIN_PAGES - 1 } }).pause).toBe(false);
        expect(shouldPause({ ...ALL, end: { start: 3, end: 5, pages: SURVIVED_MIN_PAGES } }).pause).toBe(true);
        // An EPUB chapter not yet drawn has no words to count: not a chapter to pause at.
        expect(shouldPause({ ...ALL, end: { start: 3, end: 3 } }).pause).toBe(false);
    });

    it("never pauses on a chapter read for less than two minutes in this sitting", () => {
        expect(shouldPause({ ...ALL, sittingMs: SURVIVED_MIN_MS - 1000 }).reason).toBe("unread");
        expect(shouldPause({ ...ALL, sittingMs: SURVIVED_MIN_MS }).pause).toBe(true);
    });

    it("never pauses on a chapter where nothing is marked (the owner's decision)", () => {
        expect(shouldPause({ ...ALL, marks: 0 })).toEqual({ pause: false, reason: "unmarked", spendSkip: false });
    });

    it("never pauses at the last chapter: the book's end card has that place", () => {
        expect(shouldPause({ ...ALL, last: true }).reason).toBe("last");
    });

    it("never pauses after a skip, and spends it", () => {
        expect(shouldPause({ ...ALL, skipPending: true })).toEqual({ pause: false, reason: "skipped", spendSkip: true });
    });

    it("never pauses while listening, or with the switch off", () => {
        expect(shouldPause({ ...ALL, listening: true }).reason).toBe("listening");
        expect(shouldPause({ ...ALL, enabled: false }).reason).toBe("off");
    });

    it("never pauses on a turn that ends no chapter", () => {
        expect(shouldPause({ ...ALL, end: null }).reason).toBe("no-chapter");
    });

    it("a skip is only spent by an end that would have paused", () => {
        expect(shouldPause({ ...ALL, skipPending: true, marks: 0 }).spendSkip).toBe(false);
        expect(shouldPause({ ...ALL, skipPending: true, sittingMs: 1000 }).spendSkip).toBe(false);
    });
});

describe("what survived: where a chapter ends (#755 AC-2)", () => {
    it("an EPUB's chapters are its spine items, with the words of those drawn", () => {
        const ends = chapterEnds({ format: "epub", chapters: 3, toc: [], words: (i) => (i === 1 ? 2000 : undefined) });
        expect(ends).toEqual([
            { start: 0, end: 0 },
            { start: 1, end: 1, words: 2000 },
            { start: 2, end: 2 },
        ]);
        expect(endingAt(ends, 1, 2)).toEqual({ start: 1, end: 1, words: 2000 });
    });

    it("a PDF's chapters are its outline's top-level sections", () => {
        const toc = [
            { title: "Introduction", chapter: 1, depth: 0 },
            { title: "Background", chapter: 2, depth: 1 },
            { title: "Method", chapter: 5, depth: 0 },
            { title: "Method, again", chapter: 5, depth: 0 },
            { title: "Results", chapter: 9, depth: 0 },
        ];
        const ends = chapterEnds({ format: "pdf", chapters: 12, toc });
        expect(ends).toEqual([
            { start: 1, end: 4, pages: 4, title: "Introduction" },
            { start: 5, end: 8, pages: 4, title: "Method" },
            { start: 9, end: 11, pages: 3, title: "Results" },
        ]);
        // The turn from a section's last page to the next one's first ends it; any other turn does not.
        expect(endingAt(ends, 4, 5)?.title).toBe("Introduction");
        expect(endingAt(ends, 3, 4)).toBeNull();
        expect(endingAt(ends, 0, 1)).toBeNull();
        expect(endingAt(ends, 4, 6)).toBeNull();
        expect(spanOf(ends, 0)).toBeNull();
        expect(spanOf(ends, 7)?.title).toBe("Method");
    });

    it("a PDF without an outline, an article and a path have no chapter ends", () => {
        expect(chapterEnds({ format: "pdf", chapters: 40, toc: [] })).toEqual([]);
        expect(chapterEnds({ format: "article", chapters: 4, toc: [{ title: "A", chapter: 0, depth: 0 }] })).toEqual([]);
        expect(chapterEnds({ format: "path", chapters: 4, toc: [] })).toEqual([]);
    });
});

describe("what survived: the skip (#755 AC-3)", () => {
    it("under four seconds untouched is a skip; touched, or later, is not", () => {
        expect(wasSkip(0, 3900, false)).toBe(true);
        expect(wasSkip(0, 3900, true)).toBe(false);
        expect(wasSkip(0, 4100, false)).toBe(false);
        expect(SURVIVED_SKIP_MS).toBe(4000);
    });

    it("after a skip the next qualifying end passes, and the one after pauses", () => {
        let skipPending = wasSkip(1000, 2000, false);
        const next = shouldPause({ ...ALL, skipPending });
        expect(next.pause).toBe(false);
        if (next.spendSkip) skipPending = false;
        expect(shouldPause({ ...ALL, skipPending }).pause).toBe(true);
    });
});

describe("what survived: the time this sitting spent on a chapter (#755 FR-2.3)", () => {
    it("runs for the chapter on screen, and stops while the Reader is hidden", () => {
        let now = 0;
        const clock = new SittingClock(() => now);
        clock.at(2);
        now = 60_000;
        clock.setVisible(false);
        now = 600_000;
        expect(clock.total(2)).toBe(60_000);
        clock.setVisible(true);
        now = 650_000;
        expect(clock.total(2)).toBe(110_000);
        clock.at(3);
        now = 700_000;
        expect(clock.total(2)).toBe(110_000);
        expect(clock.total(3)).toBe(50_000);
        // Back on chapter 2: its time goes on from where it was.
        clock.at(2);
        now = 720_000;
        expect(clock.total(2)).toBe(130_000);
        clock.at(null);
        now = 900_000;
        expect(clock.total(2)).toBe(130_000);
    });
});

describe("what survived: it touched (#755 FR-3)", () => {
    it("the notes born from this chapter, linked from its marks, or peeked from it: each once, never the book", () => {
        const touched = touchedNotes({
            keys: new Set(["text/ch4.xhtml"]),
            born: [
                { path: "Ideas/Born here.md", cites: ["text/ch4.xhtml"] },
                { path: "Ideas/Born elsewhere.md", cites: ["text/ch2.xhtml"] },
                { path: "Library/Middlemarch.md", cites: ["text/ch4.xhtml"] },
            ],
            linked: ["Ideas/Linked.md", "Ideas/Born here.md"],
            peeked: ["Ideas/Peeked.md"],
            exclude: new Set(["Library/Middlemarch.md", "Books/Middlemarch.epub"]),
        });
        expect(touched).toEqual(["Ideas/Born here.md", "Ideas/Linked.md", "Ideas/Peeked.md"]);
    });
});
