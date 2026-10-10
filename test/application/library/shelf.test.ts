import { describe, it, expect } from "@jest/globals";
import {
    BOOK_PAGES,
    buildShelf,
    continueReading,
    shelfCounts,
    titleFromName,
    viewShelf,
    type ShelfInputs,
} from "application/library/shelf";
import {
    forgetMissing,
    isFresh,
    normalizeLibrary,
    progressOf,
    renameSource,
    sourceFormat,
    withFacts,
    withBookmarks,
    withPlace,
    LIBRARY_LIMIT,
} from "application/library/sourceMeta";
import { bornCounts, notesBornFrom } from "application/library/born";

const DAY = 86_400_000;

function inputs(over: Partial<ShelfInputs> = {}): ShelfInputs {
    return {
        sources: [
            { path: "Books/Thinking, Fast and Slow.epub", basename: "Thinking, Fast and Slow.epub" },
            { path: "Papers/gilbert_lynch_cap.pdf", basename: "gilbert_lynch_cap.pdf" },
            { path: "Papers/scan.pdf", basename: "scan.pdf" },
            { path: "notes/a.md", basename: "a.md" },
        ],
        meta: {
            "Books/Thinking, Fast and Slow.epub": { size: 1, mtime: 1, title: "Thinking, Fast and Slow", author: "Daniel Kahneman", chapters: 38, chapter: 2, at: 5 * DAY },
            "Papers/gilbert_lynch_cap.pdf": { size: 1, mtime: 1, chapters: 12, chapter: 7, at: 9 * DAY },
            "Papers/scan.pdf": { size: 1, mtime: 1, chapters: 300, imageOnly: true },
        },
        saved: [{ id: "r1", name: "Distributed systems · Argument", seed: "n/a.md", paths: ["n/a.md", "n/b.md"], at: 3 * DAY }],
        pathPlaces: new Map([["r1", { chapter: 0, total: 2, at: 4 * DAY }]]),
        highlights: new Map([
            ["Books/Thinking, Fast and Slow.epub", 23],
            ["n/a.md", 2],
            ["n/b.md", 3],
        ]),
        born: new Map([["Papers/gilbert_lynch_cap.pdf", 2]]),
        ...over,
    };
}

describe("the Library shelf (#680)", () => {
    it("puts books, papers and saved paths on one shelf, and nothing that is not a source", () => {
        const shelf = buildShelf(inputs());
        expect(shelf.map((item) => [item.kind, item.format, item.title])).toEqual([
            ["book", "epub", "Thinking, Fast and Slow"],
            ["paper", "pdf", "gilbert lynch cap"],
            // Three hundred pages is a book, whatever its format.
            ["book", "pdf", "scan"],
            ["path", "path", "Distributed systems · Argument"],
        ]);
        expect(BOOK_PAGES).toBeLessThan(300);
    });

    it("says what came of each one: progress, highlights, notes born, last read", () => {
        const [book, paper, scan, path] = buildShelf(inputs());
        expect(book).toMatchObject({ author: "Daniel Kahneman", highlights: 23, born: 0, lastRead: 5 * DAY, place: 2 });
        expect(book.progress).toBeCloseTo(3 / 38);
        expect(paper).toMatchObject({ born: 2, progress: 8 / 12 });
        expect(scan).toMatchObject({ imageOnly: true, lastRead: 0, progress: 0 });
        // A path's highlights are its notes' highlights; its place is the resume of that set.
        expect(path).toMatchObject({ highlights: 5, progress: 0.5, lastRead: 4 * DAY, savedId: "r1", paths: ["n/a.md", "n/b.md"] });
    });

    it("filters, searches without accents, and counts each filter", () => {
        const shelf = buildShelf(inputs());
        expect(shelfCounts(shelf)).toEqual({ all: 4, books: 2, papers: 1, paths: 1 });
        expect(viewShelf(shelf, { filter: "papers", sort: "recent", search: "" }).map((i) => i.title)).toEqual(["gilbert lynch cap"]);
        expect(viewShelf(shelf, { filter: "all", sort: "recent", search: "KAHNEMAN" }).map((i) => i.title)).toEqual(["Thinking, Fast and Slow"]);
        const withAccent = buildShelf(inputs({ meta: { "Books/Thinking, Fast and Slow.epub": { size: 1, mtime: 1, author: "Sönke Ahrens", chapters: 3 } } }));
        expect(viewShelf(withAccent, { filter: "all", sort: "recent", search: "sonke" })).toHaveLength(1);
    });

    it("orders by last read, by highlights or by title — never-opened things last, by title", () => {
        const shelf = buildShelf(inputs());
        expect(viewShelf(shelf, { filter: "all", sort: "recent", search: "" }).map((i) => i.title)).toEqual([
            "gilbert lynch cap",
            "Thinking, Fast and Slow",
            "Distributed systems · Argument",
            "scan",
        ]);
        expect(viewShelf(shelf, { filter: "all", sort: "highlighted", search: "" })[0].title).toBe("Thinking, Fast and Slow");
        expect(viewShelf(shelf, { filter: "all", sort: "title", search: "" })[0].title).toBe("Distributed systems · Argument");
    });

    it("continues the two you were last in and have not finished", () => {
        const shelf = buildShelf(inputs());
        expect(continueReading(shelf).map((i) => i.title)).toEqual(["gilbert lynch cap", "Thinking, Fast and Slow"]);
    });

    it("names a file it has not read yet by its name, tidied", () => {
        expect(titleFromName("event_sourcing  survey.PDF")).toBe("event sourcing survey");
    });
});

describe("what the Library remembers (#680)", () => {
    it("keeps only well-formed sources and never throws", () => {
        expect(normalizeLibrary(null)).toEqual({});
        expect(normalizeLibrary([])).toEqual({});
        expect(
            normalizeLibrary({
                "a.pdf": { size: 3, mtime: 4, title: " T ", chapters: 12.2, imageOnly: true, chapter: 2, at: 9, done: true },
                "b.md": { size: 1, mtime: 1 },
                "c.epub": { size: "x" },
            })
        ).toEqual({ "a.pdf": { size: 3, mtime: 4, title: "T", chapters: 12, imageOnly: true, chapter: 2, at: 9, done: true } });
        expect(sourceFormat("x/Y.EPUB")).toBe("epub");
        expect(sourceFormat("x/y.md")).toBeNull();
    });

    it("reads a file's facts again when it changed, and keeps your place in it", () => {
        let map = withPlace({}, "a.pdf", 4, 12, 100, 10, 20);
        map = withFacts(map, "a.pdf", { title: "Paper", chapters: 12, imageOnly: true }, 10, 20);
        expect(isFresh(map["a.pdf"], 10, 20)).toBe(true);
        expect(isFresh(map["a.pdf"], 11, 20)).toBe(false);
        expect(map["a.pdf"]).toMatchObject({ title: "Paper", imageOnly: true, chapter: 4, at: 100 });
        // A shorter replacement clamps the place rather than pointing past the end.
        map = withFacts(map, "a.pdf", { chapters: 3 }, 11, 21);
        expect(map["a.pdf"]).toMatchObject({ chapter: 2, chapters: 3 });
        expect(map["a.pdf"].imageOnly).toBeUndefined();
    });

    it("marks a source read at its last chapter, and it stays read", () => {
        let map = withPlace({}, "a.epub", 9, 10, 1);
        expect(map["a.epub"].done).toBe(true);
        expect(progressOf(map["a.epub"])).toBe(1);
        map = withPlace(map, "a.epub", 1, 10, 2);
        expect(map["a.epub"].done).toBe(true);
        expect(progressOf(map["a.epub"])).toBeCloseTo(0.2);
    });

    it("follows a rename, forgets what left the vault, and stays bounded", () => {
        const map = renameSource(withPlace({}, "a.pdf", 1, 3, 1), "a.pdf", "b/a.pdf");
        expect(Object.keys(map)).toEqual(["b/a.pdf"]);
        expect(forgetMissing(map, new Set())).toEqual({});
        let big = {};
        for (let i = 0; i < LIBRARY_LIMIT + 5; i++) big = withPlace(big, `s${i}.pdf`, 0, 2, i);
        expect(Object.keys(big)).toHaveLength(LIBRARY_LIMIT);
        expect(big).not.toHaveProperty("s0.pdf");
    });
});

describe("bookmarks kept beside the book's place (#761 FR-2, AC-1)", () => {
    const mark = (chapter: number, offset: number, at: number) => ({ chapter, offset, at, quote: { exact: "System 2 allocates attention", prefix: "", suffix: "" } });

    it("reads valid bookmarks back and drops malformed ones", () => {
        const map = normalizeLibrary({ "a.epub": { size: 1, mtime: 2, bookmarks: [mark(3, 10, 5), { chapter: "x" }, { chapter: 1, offset: 0, at: 4 }] } });
        expect(map["a.epub"].bookmarks).toEqual([{ chapter: 1, offset: 0, at: 4 }, mark(3, 10, 5)]);
        expect(normalizeLibrary({ "a.epub": { size: 1, mtime: 2, bookmarks: "none" } })["a.epub"]).not.toHaveProperty("bookmarks");
    });

    it("keeps them when the file is replaced by a new copy, as it keeps the place", () => {
        let map = withPlace({}, "a.epub", 4, 12, 100, 10, 20);
        map = withBookmarks(map, "a.epub", [mark(4, 30, 101)]);
        map = withFacts(map, "a.epub", { title: "Book", chapters: 12 }, 99, 999);
        expect(map["a.epub"]).toMatchObject({ size: 99, mtime: 999, chapter: 4, bookmarks: [mark(4, 30, 101)] });
    });

    it("keeps them through a turn and a rename, and an empty list leaves no field", () => {
        let map = withBookmarks({}, "a.pdf", [mark(2, 0, 7)], 10, 20);
        expect(map["a.pdf"]).toMatchObject({ size: 10, mtime: 20 });
        map = withPlace(map, "a.pdf", 5, 9, 8);
        expect(map["a.pdf"].bookmarks).toHaveLength(1);
        map = renameSource(map, "a.pdf", "b/a.pdf");
        expect(map["b/a.pdf"].bookmarks).toHaveLength(1);
        map = withBookmarks(map, "b/a.pdf", []);
        expect(map["b/a.pdf"]).not.toHaveProperty("bookmarks");
        expect(map["b/a.pdf"].chapter).toBe(5);
    });
});

describe("notes born from a source (#680)", () => {
    it("counts the notes that cite a PDF or an EPUB by link, once each", () => {
        const born = notesBornFrom([
            { path: "z/least effort.md", claims: [{ sources: [{ ref: "Books/tfs.epub", kind: "link" }] }, { sources: [{ ref: "Books/tfs.epub", kind: "link" }] }] },
            { path: "z/cap.md", claims: [{ sources: [{ ref: "Papers/cap.pdf", kind: "link" }, { ref: "z/other.md", kind: "link" }] }] },
            { path: "z/text.md", claims: [{ sources: [{ ref: "Papers/cap.pdf", kind: "text" }] }] },
        ]);
        expect([...born]).toEqual([
            ["Books/tfs.epub", ["z/least effort.md"]],
            ["Papers/cap.pdf", ["z/cap.md"]],
        ]);
        expect(bornCounts(born).get("Papers/cap.pdf")).toBe(1);
    });
});
