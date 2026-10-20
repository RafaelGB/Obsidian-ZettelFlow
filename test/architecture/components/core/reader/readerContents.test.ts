import { describe, it, expect } from "@jest/globals";
import { contentsShape, currentRow, currentSection, entryCount, filterShape, matchSpan, splitNumber, FIND_AT, type ContentsEntry } from "architecture/components/core/reader/readerContents";

/** A book with front matter, two parts, a chapter with sections inside its own file, and back matter. */
const NOVEL: ContentsEntry[] = [
    { title: "Cover", chapter: 0, depth: 0 },
    { title: "Epigraph", chapter: 1, depth: 0 },
    { title: "Part One · Headwaters", chapter: 2, depth: 0 },
    { title: "1. The spring under the stone", chapter: 3, depth: 1 },
    { title: "2. What the snow remembers", chapter: 4, depth: 1 },
    { title: "Part Two · The middle course", chapter: 5, depth: 0 },
    { title: "7. Meanders", chapter: 6, depth: 1 },
    { title: "Why rivers refuse straight lines", chapter: 6, depth: 2, fragment: "s1" },
    { title: "The oxbow", chapter: 6, depth: 2, fragment: "s2" },
    { title: "8. Floods", chapter: 7, depth: 1 },
    { title: "Notes", chapter: 8, depth: 0 },
    { title: "Index", chapter: 9, depth: 0 },
];

/** A PDF outline three levels deep: sections → chapters → sub-sections, on pages. */
const GUIDE: ContentsEntry[] = [
    { title: "Foreword", chapter: 2, depth: 0 },
    { title: "1 · Foundations", chapter: 10, depth: 0 },
    { title: "1.1 What counts as a wetland", chapter: 10, depth: 1 },
    { title: "1.2 Reading water levels", chapter: 18, depth: 1 },
    { title: "3 · Habitats", chapter: 60, depth: 0 },
    { title: "3.2 Tidal marshes", chapter: 66, depth: 1 },
    { title: "Low marsh", chapter: 66, depth: 2 },
    { title: "High marsh", chapter: 69, depth: 2 },
    { title: "Salt pans and standing water", chapter: 74, depth: 2 },
    { title: "3.3 Mudflats", chapter: 78, depth: 1 },
];

/** A paper: two levels, numbered. */
const PAPER: ContentsEntry[] = [
    { title: "Abstract", chapter: 0, depth: 0 },
    { title: "1 Introduction", chapter: 0, depth: 0 },
    { title: "3 Method", chapter: 2, depth: 0 },
    { title: "3.1 Memory slots", chapter: 2, depth: 1 },
    { title: "3.2 The router", chapter: 3, depth: 1 },
    { title: "References", chapter: 9, depth: 0 },
];

const pages = (chapter: number) => String(chapter + 1);

describe("a title's own number, set apart (#861 FR-9)", () => {
    it.each([
        ["3.2 Tidal marshes", "3.2", "Tidal marshes"],
        ["1 · The characters of the story", "1", "The characters of the story"],
        ["7. Meanders", "7", "Meanders"],
        ["12: A long one", "12", "A long one"],
        ["A.1 Proofs", "A.1", "Proofs"],
        ["IV. Rome", "IV", "Rome"],
        ["2) Second", "2", "Second"],
    ])("%s → %s · %s", (raw, num, title) => {
        expect(splitNumber(raw)).toEqual({ num, title });
    });

    it.each(["A map drawn by water", "1984 Revisited", "2001: A Space Odyssey", "Introduction", "7", "I think therefore", "3.2"])("leaves %s whole", (raw) => {
        expect(splitNumber(raw)).toEqual({ num: "", title: raw });
    });
});

describe("the shape of a book's contents (#861 FR-5, FR-8, FR-11)", () => {
    it("reads an EPUB's parts from entries whose chapters lie in other files, and its chapters' sections from fragments", () => {
        const shape = contentsShape({ reflowed: true, toc: NOVEL });
        expect(shape.map((g) => [g.kind, g.title, g.rows.map((r) => r.title)])).toEqual([
            ["front", "", ["Cover", "Epigraph"]],
            ["part", "Part One · Headwaters", ["The spring under the stone", "What the snow remembers"]],
            ["part", "Part Two · The middle course", ["Meanders", "Floods"]],
            ["back", "", ["Notes", "Index"]],
        ]);
        const meanders = shape[2].rows[0];
        expect(meanders).toMatchObject({ num: "7", chapter: 6 });
        expect(meanders.sections.map((s) => [s.title, s.fragment])).toEqual([
            ["Why rivers refuse straight lines", "s1"],
            ["The oxbow", "s2"],
        ]);
        // A reflowed book has no pages to point at.
        expect(shape.flatMap((g) => g.rows).every((r) => r.locator === undefined)).toBe(true);
    });

    it("keeps an EPUB without parts as one list, chapters with their sections, and no matter bands", () => {
        const flat: ContentsEntry[] = [
            { title: "One", chapter: 0, depth: 0 },
            { title: "A section", chapter: 0, depth: 1, fragment: "a" },
            { title: "Two", chapter: 1, depth: 0 },
        ];
        const shape = contentsShape({ reflowed: true, toc: flat });
        expect(shape).toHaveLength(1);
        expect(shape[0].kind).toBe("loose");
        expect(shape[0].rows.map((r) => [r.title, r.sections.length])).toEqual([
            ["One", 1],
            ["Two", 0],
        ]);
    });

    it("makes a PDF's top level its parts only when the outline is three levels deep, with page locators", () => {
        const shape = contentsShape({ reflowed: false, toc: GUIDE, locator: pages });
        expect(shape.map((g) => [g.kind, g.title])).toEqual([
            ["front", ""],
            ["part", "1 · Foundations"],
            ["part", "3 · Habitats"],
        ]);
        const tidal = shape[2].rows[0];
        expect(tidal).toMatchObject({ num: "3.2", title: "Tidal marshes", locator: "67" });
        expect(tidal.sections.map((s) => [s.title, s.locator])).toEqual([
            ["Low marsh", "67"],
            ["High marsh", "70"],
            ["Salt pans and standing water", "75"],
        ]);
    });

    it("keeps a two-level outline's top level as chapters, their sub-entries as sections", () => {
        const shape = contentsShape({ reflowed: false, toc: PAPER, locator: pages });
        expect(shape).toHaveLength(1);
        expect(shape[0].rows.map((r) => [r.num, r.title, r.locator, r.sections.map((s) => s.num)])).toEqual([
            ["", "Abstract", "1", []],
            ["1", "Introduction", "1", []],
            ["3", "Method", "3", ["3.1", "3.2"]],
            ["", "References", "10", []],
        ]);
    });

    it("keeps an article's headings each its own row, as before (FR-20)", () => {
        const shape = contentsShape({ reflowed: true, flat: true, toc: NOVEL });
        expect(shape).toHaveLength(1);
        expect(shape[0].rows).toHaveLength(NOVEL.length);
        expect(shape[0].rows.every((r) => r.sections.length === 0)).toBe(true);
    });

    it("draws a list with no contents as one row per chapter", () => {
        const shape = contentsShape({ reflowed: false, toc: [0, 1, 2].map((i) => ({ title: `Page ${i + 1}`, chapter: i, depth: 0 })) });
        expect(shape).toHaveLength(1);
        expect(shape[0].rows.map((r) => r.title)).toEqual(["Page 1", "Page 2", "Page 3"]);
    });

    it("never takes an entry deeper than its parent for a parent, however the depths skip", () => {
        const skipped: ContentsEntry[] = [
            { title: "One", chapter: 0, depth: 0 },
            { title: "Deep", chapter: 0, depth: 3, fragment: "d" },
            { title: "Two", chapter: 1, depth: 0 },
        ];
        const shape = contentsShape({ reflowed: true, toc: skipped });
        expect(shape[0].rows.map((r) => [r.title, r.sections.map((s) => s.title)])).toEqual([
            ["One", ["Deep"]],
            ["Two", []],
        ]);
    });

    it("counts every entry it holds: bands, rows and sections", () => {
        expect(entryCount(contentsShape({ reflowed: true, toc: NOVEL }))).toBe(NOVEL.length);
        expect(entryCount(contentsShape({ reflowed: false, toc: GUIDE }))).toBe(GUIDE.length);
        expect(FIND_AT).toBe(24);
    });
});

describe("where you are in it (#861 FR-12)", () => {
    it("is the row of the chapter on screen, else the last one before it", () => {
        const shape = contentsShape({ reflowed: true, toc: NOVEL });
        expect(currentRow(shape, 6)).toEqual({ group: 2, row: 0 });
        expect(currentRow(shape, 1)).toEqual({ group: 0, row: 1 });
        // A part's own title page is before its first chapter: the row before it.
        expect(currentRow(shape, 5)).toEqual({ group: 1, row: 1 });
        expect(currentRow(contentsShape({ reflowed: false, toc: GUIDE }), 70)).toEqual({ group: 2, row: 0 });
    });

    it("is nothing before the first entry", () => {
        expect(currentRow(contentsShape({ reflowed: false, toc: GUIDE }), 0)).toBeNull();
    });

    it("in a paged source, is the last section starting on or before the page", () => {
        const tidal = contentsShape({ reflowed: false, toc: GUIDE })[2].rows[0];
        expect(currentSection(tidal, 69)).toBe(1);
        expect(currentSection(tidal, 72)).toBe(1);
        expect(currentSection(tidal, 66)).toBe(0);
        expect(currentSection(tidal, 80)).toBe(2);
    });

    it("in a reflowed chapter, is the last section heading above the top of the screen", () => {
        const meanders = contentsShape({ reflowed: true, toc: NOVEL })[2].rows[0];
        const offsets: Record<string, number> = { s1: 100, s2: 900 };
        const at = (top: number) => currentSection(meanders, 6, { top, offsetOf: (f) => offsets[f] ?? null });
        expect(at(50)).toBe(-1);
        expect(at(100)).toBe(0);
        expect(at(1200)).toBe(1);
        // Without the page's layout, a section inside the chapter is never guessed.
        expect(currentSection(meanders, 6)).toBe(-1);
    });
});

describe("finding in the contents (#861 FR-16)", () => {
    it("matches whatever the case and the accents, and says where in the original text", () => {
        expect(matchSpan("Salt pans and standing Water", "WAT")).toEqual([23, 26]);
        expect(matchSpan("Évora, ciudad", "evora")).toEqual([0, 5]);
        expect(matchSpan("Canción", "cion")).toEqual([3, 7]);
        expect(matchSpan("Bridges", "zzz")).toBeNull();
    });

    it("keeps the rows and sections that match, and the bands only while they hold one", () => {
        const shape = contentsShape({ reflowed: false, toc: GUIDE, locator: pages });
        const found = filterShape(shape, "marsh");
        expect(found.map((g) => g.title)).toEqual(["3 · Habitats"]);
        expect(found[0].rows.map((r) => [r.title, r.hit])).toEqual([["Tidal marshes", [6, 11]]]);
        // The row matched itself: all of its sections stay, each marked where it matches.
        expect(found[0].rows[0].sections.map((s) => [s.title, s.hit ?? null])).toEqual([
            ["Low marsh", [4, 9]],
            ["High marsh", [5, 10]],
            ["Salt pans and standing water", null],
        ]);
    });

    it("keeps a row for a section that matches, with only the matching sections", () => {
        const found = filterShape(contentsShape({ reflowed: false, toc: GUIDE }), "water");
        expect(found.flatMap((g) => g.rows.map((r) => [r.title, r.hit ?? null, r.sections.map((s) => s.title)]))).toEqual([
            ["Reading water levels", [8, 13], []],
            ["Tidal marshes", null, ["Salt pans and standing water"]],
        ]);
    });

    it("finds nothing as nothing, and an empty query as the whole shape", () => {
        const shape = contentsShape({ reflowed: true, toc: NOVEL });
        expect(filterShape(shape, "zzzz")).toEqual([]);
        expect(filterShape(shape, "   ")).toBe(shape);
    });
});
