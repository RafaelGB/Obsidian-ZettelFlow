import { describe, it, expect } from "@jest/globals";
import {
    BOOK_PAGES,
    buildShelf,
    bookViewOf,
    DESK_LIMIT,
    layShelves,
    shelfCounts,
    statusCounts,
    titleFromName,
    type ShelfQuery,
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
import { indexBookNotes } from "application/library/bookNote";

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
        expect(shelfCounts(shelf)).toEqual({ all: 4, books: 2, papers: 1, articles: 0, paths: 1 });
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

    it("lays the two you were last in and have not finished open on the desk (#820 AC-1)", () => {
        const shelf = buildShelf(inputs());
        const desk = layShelves(shelf, { filter: "all", sort: "title", search: "" }).desk;
        expect(desk.map((i) => i.title)).toEqual(["gilbert lynch cap", "Thinking, Fast and Slow"]);
        expect(DESK_LIMIT).toBe(2);
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
                "b.txt": { size: 1, mtime: 1 },
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

describe("the shelf reads the book notes (#743)", () => {
    const BOOK = "Books/Thinking, Fast and Slow.epub";
    const PAPER = "Papers/gilbert_lynch_cap.pdf";
    const notes = indexBookNotes([
        {
            path: "Library/Thinking, Fast and Slow.md",
            source: BOOK,
            frontmatter: { title: "Thinking, fast and slow", author: ["Daniel Kahneman", "Amos Tversky"], series: "Penguin Psychology", status: "finished", collections: ["Planning"] },
        },
        { path: "Elsewhere/cap.md", source: PAPER, frontmatter: { status: "to-read", collections: ["Software design", "Planning"] } },
    ]);

    it("shows the note's title and author over the file's, and carries its status, collections and series (AC-6)", () => {
        const shelf = buildShelf(inputs({ notes }));
        const book = shelf.find((item) => item.id === BOOK)!;
        expect(book).toMatchObject({
            title: "Thinking, fast and slow",
            author: "Daniel Kahneman, Amos Tversky",
            status: "finished",
            note: "Library/Thinking, Fast and Slow.md",
            collections: ["Planning"],
            series: "Penguin Psychology",
        });
        // Without a note, the file's own, and a status read from the reading.
        const bare = buildShelf(inputs());
        expect(bare.find((item) => item.id === BOOK)).toMatchObject({ title: "Thinking, Fast and Slow", author: "Daniel Kahneman", status: "reading" });
        expect(bare.find((item) => item.id === BOOK)).not.toHaveProperty("note");
        expect(bare.find((item) => item.id === "Papers/scan.pdf")).not.toHaveProperty("status");
        expect(bare.find((item) => item.kind === "path")?.status).toBe("reading");
    });

    it("filters by status and by collection", () => {
        const shelf = buildShelf(inputs({ notes }));
        const ids = (query: Partial<Parameters<typeof viewShelf>[1]>) =>
            viewShelf(shelf, { filter: "all", sort: "title", search: "", ...query }).map((item) => item.id);
        expect(ids({ status: "to-read" })).toEqual([PAPER]);
        expect(ids({ status: "finished" })).toEqual([BOOK]);
        expect(ids({ status: "reading" })).toEqual(["path:r1"]);
        expect(ids({ collection: "planning" })).toEqual([PAPER, BOOK]);
        expect(ids({ collection: "Software design", status: "finished" })).toEqual([]);
        expect(statusCounts(shelf)).toEqual({ all: 4, "to-read": 1, reading: 1, finished: 1, none: 1 });
        // On the shelf (#819, #820): what has no status yet — never opened, nothing said about it.
        expect(ids({ status: "none" })).toEqual(shelf.filter((item) => !item.status).map((item) => item.id).sort());
    });

    it("draws the Want to read shelf only when something stands on it (#820 AC-5)", () => {
        const shelves = (shelf: ReturnType<typeof buildShelf>) => layShelves(shelf, { filter: "all", sort: "recent", search: "", status: "to-read" }).shelves;
        expect(shelves(buildShelf(inputs({ notes }))).find((row) => row.status === "to-read")?.items.map((item) => item.id)).toEqual([PAPER]);
        expect(shelves(buildShelf(inputs())).some((row) => row.status === "to-read")).toBe(false);
    });

    it("puts no book you said you finished, or put back to Want to read, on the desk", () => {
        const desk = (shelf: ReturnType<typeof buildShelf>) => layShelves(shelf, { filter: "all", sort: "recent", search: "" }).desk.map((item) => item.id);
        expect(desk(buildShelf(inputs()))).toEqual([PAPER, BOOK]);
        const set = indexBookNotes([
            { path: "Library/T.md", source: BOOK, frontmatter: { status: "finished" } },
            { path: "Library/C.md", source: PAPER, frontmatter: { status: "to-read" } },
        ]);
        expect(desk(buildShelf(inputs({ notes: set })))).toEqual(["path:r1"]);
    });

    it("finds a book by its series and by its collection (FR-10)", () => {
        const shelf = buildShelf(inputs({ notes }));
        const found = (search: string) => viewShelf(shelf, { filter: "all", sort: "title", search }).map((item) => item.id);
        expect(found("penguin")).toEqual([BOOK]);
        expect(found("software design")).toEqual([PAPER]);
        expect(found("tversky")).toEqual([BOOK]);
    });
});

describe("a book's note is never born from its book (#743 AC-7)", () => {
    it("is left out even when it also cites the book", () => {
        const ideas = [
            { path: "Library/Thinking, Fast and Slow.md", claims: [{ sources: [{ ref: "Books/Thinking, Fast and Slow.epub", kind: "link" }] }] },
            { path: "z/system 1.md", claims: [{ sources: [{ ref: "Books/Thinking, Fast and Slow.epub", kind: "link" }] }] },
        ];
        expect(notesBornFrom(ideas).get("Books/Thinking, Fast and Slow.epub")).toEqual(["Library/Thinking, Fast and Slow.md", "z/system 1.md"]);
        expect(notesBornFrom(ideas, new Set(["Library/Thinking, Fast and Slow.md"])).get("Books/Thinking, Fast and Slow.epub")).toEqual(["z/system 1.md"]);
    });
});

describe("articles on the shelf, and what is new (#744)", () => {
    const NOW = 100 * DAY;
    const article = {
        path: "Clippings/The case for slow software.md",
        basename: "The case for slow software.md",
        details: { title: "The case for slow software", author: ["Jane Doe"], year: 2025, collections: ["Software design"] },
        host: "example.com",
        added: NOW - 2 * DAY,
    };

    it("gives an article its kind, title, byline, year, highlights, notes born and place (AC-2)", () => {
        const shelf = buildShelf(
            inputs({
                articles: [article, { path: "Clippings/untitled_note.md", basename: "untitled_note.md", details: {}, host: "blog.example.org", added: NOW - 40 * DAY }],
                meta: { "Clippings/The case for slow software.md": { size: 1, mtime: 1, chapters: 4, chapter: 1, at: 3 * DAY } },
                highlights: new Map([["Clippings/The case for slow software.md", 1]]),
                born: new Map([["Clippings/The case for slow software.md", 2]]),
            })
        );
        const [slow, untitled] = shelf.filter((item) => item.kind === "article");
        expect(slow).toMatchObject({
            id: "Clippings/The case for slow software.md",
            kind: "article",
            format: "article",
            title: "The case for slow software",
            author: "Jane Doe",
            file: "Clippings/The case for slow software.md",
            note: "Clippings/The case for slow software.md",
            highlights: 1,
            born: 2,
            place: 1,
            chapters: 4,
            lastRead: 3 * DAY,
            status: "reading",
            collections: ["Software design"],
            host: "example.com",
        });
        expect(slow.details?.year).toBe(2025);
        expect(slow.progress).toBeCloseTo(2 / 4);
        // Nobody signed it: the site is the byline; no title: the file's name, tidied.
        expect(untitled).toMatchObject({ title: "untitled note", author: "blog.example.org", progress: 0 });
        expect(shelfCounts(shelf)).toMatchObject({ all: 6, articles: 2 });
        expect(viewShelf(shelf, { filter: "articles", sort: "title", search: "" }).map((item) => item.title)).toEqual(["The case for slow software", "untitled note"]);
        expect(viewShelf(shelf, { filter: "all", sort: "recent", search: "jane" }).map((item) => item.title)).toEqual(["The case for slow software"]);
    });

    it("orders by when it came in, newest first; what is not a file goes last (#744 FR-9)", () => {
        const sources = [
            { path: "Books/new.epub", basename: "new.epub", added: NOW - DAY },
            { path: "Books/done.epub", basename: "done.epub", added: NOW - DAY },
            { path: "Books/old.epub", basename: "old.epub", added: NOW - 31 * DAY },
            { path: "Papers/edge.pdf", basename: "edge.pdf", added: NOW - 30 * DAY },
        ];
        const shelf = buildShelf(
            inputs({
                sources,
                articles: [article],
                meta: { "Books/done.epub": { size: 1, mtime: 1, chapters: 3, chapter: 2, at: NOW, done: true } },
            })
        );
        expect(viewShelf(shelf, { filter: "all", sort: "added", search: "" }).map((item) => item.title)).toEqual([
            "done",
            "new",
            "The case for slow software",
            "edge",
            "old",
            "Distributed systems · Argument",
        ]);
    });
});

describe("where every book stands: the desk and the status shelves (#820)", () => {
    const NOW2 = 1_800_000_000_000;
    const item = (id: string, extra: Partial<ReturnType<typeof buildShelf>[number]> = {}) => ({
        id,
        kind: "book" as const,
        format: "epub" as const,
        title: id,
        progress: 0,
        highlights: 0,
        born: 0,
        lastRead: 0,
        ...extra,
    });
    const items = [
        item("a", { status: "reading", lastRead: NOW2 - 1, progress: 0.3 }),
        item("b", { status: "reading", lastRead: NOW2 - 2, progress: 0.5 }),
        item("c", { status: "reading", lastRead: NOW2 - 3, progress: 0.1 }),
        item("d", { status: "to-read" }),
        item("e"),
        item("f", { status: "finished", lastRead: NOW2 - 9, progress: 1 }),
        // Set to Reading in its note, never opened: on the Reading shelf, never the desk (decision 2).
        item("g", { status: "reading" }),
        item("h", { kind: "paper", format: "pdf", collections: ["Planning"] }),
    ];
    const lay = (query: Partial<ShelfQuery> = {}) => layShelves(items, { filter: "all", sort: "title", search: "", ...query });
    const ids = (layout: ReturnType<typeof lay>) => ({ desk: layout.desk.map((i) => i.id), shelves: layout.shelves.map((row) => [row.status ?? row.own, row.items.map((i) => i.id)]) });

    it("lays two on the desk, most recent first, and every other book on the shelf of its status, in order (AC-1, AC-3)", () => {
        expect(ids(lay())).toEqual({
            desk: ["a", "b"],
            shelves: [
                ["reading", ["c", "g"]],
                ["to-read", ["d"]],
                ["none", ["e"]],
                ["finished", ["f"]],
                // On a shelf of yours, in one place: not again on its status's (#821).
                ["Planning", ["h"]],
            ],
        });
    });

    it("has no desk once one status or one collection is chosen (AC-2)", () => {
        expect(ids(lay({ status: "reading" }))).toEqual({ desk: [], shelves: [["reading", ["a", "b", "c", "g"]]] });
        expect(ids(lay({ collection: "planning" }))).toEqual({ desk: [], shelves: [["Planning", ["h"]]] });
        expect(lay({ search: "e" }).desk).toEqual([]);
    });

    it("stands every book in at most one place, whatever is asked (AC-4)", () => {
        for (const filter of ["all", "books", "papers"] as const)
            for (const status of ["all", "reading", "to-read", "none", "finished"] as const)
                for (const sort of ["recent", "title", "added", "highlighted"] as const)
                    for (const search of ["", "a", "zzz"]) {
                        const layout = lay({ filter, status, sort, search });
                        const all = [...layout.desk, ...layout.shelves.flatMap((row) => row.items)].map((i) => i.id);
                        expect(new Set(all).size).toBe(all.length);
                        expect(layout.shelves.every((row) => row.items.length > 0)).toBe(true);
                    }
    });

    it("keeps the bar's order on the shelves, and nothing when the search finds nothing (AC-6, AC-7)", () => {
        expect(lay({ sort: "recent" }).shelves[0].items.map((i) => i.id)).toEqual(["c", "g"]);
        expect(lay({ search: "nothing like it" })).toEqual({ desk: [], shelves: [] });
        // A shelf of yours you left empty stands, with room for books — until something narrows the view.
        const own = (query: Partial<ShelfQuery>) => layShelves(items, { filter: "all", sort: "title", search: "", ...query }, ["Para releer"]).shelves.map((row) => row.own).filter(Boolean);
        expect(own({})).toEqual(["Para releer", "Planning"]);
        expect(own({ filter: "books" })).toEqual([]);
        expect(own({ search: "h" })).toEqual(["Planning"]);
    });

    it("reads the view as covers unless it says spines", () => {
        expect(bookViewOf("spines")).toBe("spines");
        expect(bookViewOf("shelf")).toBe("covers");
        expect(bookViewOf(undefined)).toBe("covers");
    });
});
