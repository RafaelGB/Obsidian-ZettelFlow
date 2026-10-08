import { describe, it, expect } from "@jest/globals";
import { WORDS_PER_MINUTE, bookMinutesLeft, learnPace, minutesLeft, paceWpm, splitMinutes } from "architecture/components/core/reader/readerPace";

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
