import { describe, it, expect } from "@jest/globals";
import { foldWithMap, searchBook, matchesIn } from "architecture/components/core/reader/readerSearch";

const BOOK = [
    "A deep module hides far more than it shows.",
    "Shallow modules are the opposite. Deep or DEEP, it does not matter.",
    "Nothing here.",
    "La informática es profunda; la Informatica también.",
];

describe("foldWithMap — what a search compares, and where it came from (#719)", () => {
    it("ignores case and accents, and maps each folded character back to the original", () => {
        const { folded, map } = foldWithMap("Informática");
        expect(folded).toBe("informatica");
        expect(map).toHaveLength(folded.length);
        expect("Informática".slice(map[6], map[6] + 1)).toBe("á");
    });
});

describe("searchBook — every match in the book, in reading order (#719)", () => {
    it("finds a word in every chapter, whatever its case", () => {
        const result = searchBook(BOOK, "deep");
        expect(result.matches.map((m) => m.chapter)).toEqual([0, 1, 1]);
        expect(result.chapters).toBe(2);
        expect(BOOK[1].slice(result.matches[2].start, result.matches[2].end)).toBe("DEEP");
    });

    it("finds a word written with or without its accent", () => {
        const result = searchBook(BOOK, "informatica");
        expect(result.matches.map((m) => BOOK[3].slice(m.start, m.end))).toEqual(["informática", "Informatica"]);
    });

    it("gives each match a snippet to recognise it by, with the match marked", () => {
        const [first] = searchBook(BOOK, "hides").matches;
        expect(first.before.endsWith("A deep module ")).toBe(true);
        expect(first.match).toBe("hides");
        expect(first.after.startsWith(" far more")).toBe(true);
    });

    it("says nothing for a query too short to mean anything, and stops at a sane number", () => {
        expect(searchBook(BOOK, " ").matches).toEqual([]);
        expect(searchBook(BOOK, "e").matches).toEqual([]);
        const many = searchBook(["ab ".repeat(1000)], "ab", 50);
        expect(many.matches).toHaveLength(50);
        expect(many.truncated).toBe(true);
    });

    it("finds a phrase across the spaces as the page shows them", () => {
        const result = searchBook(["deep\n   module"], "deep module");
        expect(result.matches).toHaveLength(1);
    });
});

describe("matchesIn — the spans to tint in the chapter on screen (#719)", () => {
    it("returns the spans of one chapter, in order", () => {
        expect(matchesIn(BOOK[1], "deep")).toEqual([
            { start: 34, end: 38 },
            { start: 42, end: 46 },
        ]);
    });
});
