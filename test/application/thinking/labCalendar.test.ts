import { describe, it, expect } from "@jest/globals";
import {
    dayKey,
    monthKey,
    presentDays,
    presentMonths,
    monthDays,
    leadingBlanks,
    monthsOfYear,
} from "application/thinking/labCalendar";

/**
 * A calendar to reach a day, never a report of one (#596, slice 3).
 *
 * The list is time, newest first. The calendar is the other way in: jump to a month, a day, a year.
 * Everything here is **local** — the day a thought belongs to is the day *you* were in, not UTC — and
 * everything here is **presence**: a day has thoughts or it does not. It never counts them (#469),
 * because "you wrote 14 things on Tuesday" is exactly the productivity report the Lab refuses to be.
 */
describe("dayKey / monthKey — the local bucket a thought falls in (#596)", () => {
    // Built from local parts, so the assertions hold in any timezone CI runs in.
    const noon = new Date(2026, 8, 29, 12, 0, 0).getTime(); // 29 Sep 2026, local
    const lateSameDay = new Date(2026, 8, 29, 23, 30, 0).getTime();
    const nextDay = new Date(2026, 8, 30, 1, 0, 0).getTime();

    it("shapes a day as YYYY-MM-DD and a month as YYYY-MM", () => {
        expect(dayKey(noon)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(monthKey(noon)).toBe(dayKey(noon).slice(0, 7));
        expect(dayKey(noon)).toBe("2026-09-29");
        expect(monthKey(noon)).toBe("2026-09");
    });

    it("puts two times in the same local day in the same bucket, and a later one in the next", () => {
        expect(dayKey(lateSameDay)).toBe(dayKey(noon));
        expect(dayKey(nextDay)).not.toBe(dayKey(noon));
    });
});

describe("presence, never a count (#596)", () => {
    const a = new Date(2026, 8, 29, 9).getTime();
    const b = new Date(2026, 8, 29, 22).getTime(); // same day as a
    const c = new Date(2026, 7, 3, 10).getTime(); // August

    it("collapses a day with many thoughts to a single mark", () => {
        const days = presentDays([a, b, c]);
        expect(days).toBeInstanceOf(Set);
        expect(days.size).toBe(2); // two distinct days, not three thoughts
        expect(days.has(dayKey(a))).toBe(true);
        expect(days.has(dayKey(c))).toBe(true);
    });

    it("collapses a month the same way", () => {
        expect([...presentMonths([a, b, c])].sort()).toEqual(["2026-08", "2026-09"]);
    });

    it("is empty for no thoughts", () => {
        expect(presentDays([]).size).toBe(0);
        expect(presentMonths([]).size).toBe(0);
    });
});

describe("the grid a month draws with (#596)", () => {
    it("has one cell per real day, so February knows its length", () => {
        expect(monthDays(2024, 1)).toHaveLength(29); // leap February
        expect(monthDays(2023, 1)).toHaveLength(28);
        expect(monthDays(2026, 8)).toHaveLength(30); // September
    });

    it("keys each cell to the local day it stands for", () => {
        const feb = monthDays(2024, 1);
        expect(feb[0]).toEqual({ day: 1, key: "2024-02-01" });
        expect(feb[28]).toEqual({ day: 29, key: "2024-02-29" });
    });

    it("counts the blanks that lead the first day, by where the week starts", () => {
        // 1 Feb 2024 is a Thursday (getDay() === 4).
        expect(leadingBlanks(2024, 1, 0)).toBe(4); // week starts Sunday
        expect(leadingBlanks(2024, 1, 1)).toBe(3); // week starts Monday
    });

    it("lays out a year as twelve months to pick from", () => {
        const year = monthsOfYear(2026);
        expect(year).toHaveLength(12);
        expect(year[0]).toEqual({ month: 0, key: "2026-01" });
        expect(year[11]).toEqual({ month: 11, key: "2026-12" });
    });
});
