import { describe, it, expect } from "@jest/globals";
import { DEFAULT_SECONDS_PER_PAGE, WORDS_PER_MINUTE, bookMinutesLeft, learnPace, minutesLeft, minutesLeftByPages, paceWpm, pagePace, splitMinutes } from "architecture/components/core/reader/readerPace";

describe("your own reading pace, learned on this device (#722)", () => {
    it("starts from a comfortable default and only trusts itself after two chapters", () => {
        expect(paceWpm(null)).toBe(WORDS_PER_MINUTE);
        const once = learnPace(null, { words: 3000, ms: 10 * 60_000 })!;
        expect(paceWpm(once)).toBe(WORDS_PER_MINUTE);
        const twice = learnPace(once, { words: 3000, ms: 10 * 60_000 })!;
        expect(paceWpm(twice)).toBe(300);
    });

    it("moves gently towards a new pace rather than jumping to it", () => {
        let pace = learnPace(learnPace(null, { words: 3000, ms: 10 * 60_000 }), { words: 3000, ms: 10 * 60_000 });
        pace = learnPace(pace, { words: 3000, ms: 20 * 60_000 }); // a slow chapter: 150 wpm
        expect(paceWpm(pace)).toBeGreaterThan(150);
        expect(paceWpm(pace)).toBeLessThan(300);
    });

    it("ignores what was not reading: a tab left open, a skim, a chapter too short to tell", () => {
        const pace = learnPace(learnPace(null, { words: 3000, ms: 10 * 60_000 }), { words: 3000, ms: 10 * 60_000 });
        expect(learnPace(pace, { words: 3000, ms: 3 * 60 * 60_000 })).toBe(pace); // 17 wpm: left open
        expect(learnPace(pace, { words: 3000, ms: 60_000 })).toBe(pace); // 3,000 wpm: skimmed
        expect(learnPace(pace, { words: 40, ms: 60_000 })).toBe(pace); // too short to tell
    });
});

describe("time left in the chapter and in the book (#722)", () => {
    it("reads at your pace", () => {
        expect(minutesLeft(3000, 0.5, 300)).toBe(5);
        expect(minutesLeft(3000, 0.99, 300)).toBe(0);
    });

    it("adds the chapters still to come: their words when known, the chapters you read otherwise", () => {
        expect(bookMinutesLeft({ chapterWordsLeft: 1500, upcoming: [3000, 3000], wpm: 300 })).toBe(25);
        expect(bookMinutesLeft({ chapterWordsLeft: 0, upcoming: { chapters: 10, averageWords: 3000 }, wpm: 300 })).toBe(100);
        expect(bookMinutesLeft({ chapterWordsLeft: 0, upcoming: [], wpm: 300 })).toBe(0);
    });

    it("splits a long time into hours and minutes", () => {
        expect(splitMinutes(220)).toEqual({ hours: 3, minutes: 40 });
        expect(splitMinutes(45)).toEqual({ hours: 0, minutes: 45 });
        expect(splitMinutes(120)).toEqual({ hours: 2, minutes: 0 });
    });
});

describe("time left in a designed book, by its pages (#771 FR-8)", () => {
    it("reads at half a minute a page until three pages have been read", () => {
        expect(DEFAULT_SECONDS_PER_PAGE).toBe(30);
        expect(pagePace([])).toBe(30);
        expect(pagePace([12_000, 14_000])).toBe(30);
    });

    it("then at the median of this reading's pages, so one long stare does not move it", () => {
        expect(pagePace([10_000, 12_000, 14_000])).toBe(12);
        expect(pagePace([10_000, 12_000, 14_000, 300_000])).toBe(13);
    });

    it("leaves out a page turned past, and a tab left open", () => {
        expect(pagePace([200, 300, 10_000, 12_000, 14_000, 3_600_000])).toBe(12);
    });

    it("says minutes, never a count, and at least one while any page is left", () => {
        expect(minutesLeftByPages(10, 30)).toBe(5);
        expect(minutesLeftByPages(1, 10)).toBe(1);
        expect(minutesLeftByPages(0, 30)).toBe(0);
    });
});
