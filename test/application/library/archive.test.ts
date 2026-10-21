import { describe, it, expect } from "@jest/globals";
import {
    ARCHIVE_DEFAULT,
    archivable,
    archiveFolderOf,
    archiveTarget,
    bookLinkResolver,
    archivedMatches,
    drawerCards,
    drawerCounts,
    folderClash,
    followArchiveRecord,
    freePath,
    leaveOffer,
    normalizeArchiveRecords,
    relinkBook,
    returnTarget,
    splitArchived,
} from "application/library/archive";
import type { ShelfItem } from "application/library/shelf";

const item = (over: Partial<ShelfItem>): ShelfItem => ({ id: over.file ?? "x", kind: "book", format: "epub", title: "Untitled", progress: 0, highlights: 0, born: 0, lastRead: 0, ...over });

describe("the archive folder (#865 FR-1, FR-2)", () => {
    it("is Library archive until chosen, and empty when emptied", () => {
        expect(archiveFolderOf(undefined)).toBe(ARCHIVE_DEFAULT);
        expect(archiveFolderOf("")).toBe("");
        expect(archiveFolderOf(" /Put away/ ")).toBe("Put away");
    });
});

describe("which folders clash (#865 FR-3, FR-4, AC-9)", () => {
    const others = { bookNotes: "Library", articles: "Clippings", dictionaries: "Reference/Dictionaries" };
    it("refuses the same folder, a folder inside, and a folder that holds another", () => {
        expect(folderClash("Library", others)).toEqual({ with: "bookNotes", how: "is" });
        expect(folderClash("Clippings/old", others)).toEqual({ with: "articles", how: "inside" });
        expect(folderClash("Reference", others)).toEqual({ with: "dictionaries", how: "holds" });
    });
    it("is slash-bounded and case-folded", () => {
        expect(folderClash("Library archive", others)).toBeNull();
        expect(folderClash("library", others)).toEqual({ with: "bookNotes", how: "is" });
        expect(folderClash("/CLIPPINGS/", others)).toEqual({ with: "articles", how: "is" });
    });
    it("skips empty folders, and an empty candidate clashes with nothing", () => {
        expect(folderClash("Clippings", { articles: "" })).toBeNull();
        expect(folderClash("", others)).toBeNull();
    });
});

describe("the shelf and the cabinet (#865 FR-7, FR-12, FR-13)", () => {
    const items = [item({ file: "Books/a.epub" }), item({ file: "Library archive/b.pdf", kind: "paper" }), item({ kind: "path", id: "path:1" })];
    it("splits by path alone", () => {
        const { shelf, archived } = splitArchived(items, "Library archive");
        expect(shelf.map((i) => i.id)).toEqual(["Books/a.epub", "path:1"]);
        expect(archived.map((i) => i.id)).toEqual(["Library archive/b.pdf"]);
    });
    it("archives nothing while off", () => {
        expect(splitArchived(items, "").archived).toEqual([]);
    });
    it("never archives a saved path", () => {
        expect(archivable(items[2])).toBe(false);
        expect(archivable(items[0])).toBe(true);
    });
});

describe("the drawers (#865 FR-14, FR-15, FR-19, AC-3, AC-13)", () => {
    const archived = [
        item({ file: "A/quiet.epub", title: "The Quiet Index", author: "Ana Ríos" }),
        item({ file: "A/rivers.pdf", kind: "paper", format: "pdf", title: "Field Notes on Rivers" }),
        item({ file: "A/lanterns.md", kind: "article", format: "article", title: "A Report on Lanterns" }),
        item({ file: "A/old.epub", title: "Old Manual" }),
    ];
    it("counts each drawer", () => {
        expect(drawerCounts(archived)).toEqual({ books: 2, papers: 1, articles: 1 });
    });
    it("finds the search's matches and the first drawer holding one, accent-insensitive", () => {
        expect(archivedMatches(archived, "rios")).toEqual({ count: 1, first: "books" });
        expect(archivedMatches(archived, " on ")).toEqual({ count: 2, first: "papers" });
        expect(archivedMatches(archived, "lantern")).toEqual({ count: 1, first: "articles" });
        expect(archivedMatches(archived, "  ")).toEqual({ count: 0, first: null });
    });
    it("lays a drawer's cards, last put away first, narrowed by its own search", () => {
        const records = { "A/quiet.epub": { from: "B/quiet.epub", at: 1 }, "A/old.epub": { from: "B/old.epub", at: 5 } };
        expect(drawerCards(archived, "books", "", records).map((i) => i.title)).toEqual(["Old Manual", "The Quiet Index"]);
        expect(drawerCards(archived, "books", "quiet", records).map((i) => i.title)).toEqual(["The Quiet Index"]);
    });
});

describe("where a file goes (#865 FR-9, FR-20, AC-5, AC-6, AC-7, AC-14)", () => {
    const taken = (paths: string[]) => (path: string) => paths.includes(path);
    it("never overwrites in the archive", () => {
        expect(archiveTarget("Books/Tech/x.pdf", "Library archive", taken([]))).toBe("Library archive/x.pdf");
        expect(archiveTarget("Books/Tech/x.pdf", "Library archive", taken(["Library archive/x.pdf", "Library archive/x 2.pdf"]))).toBe("Library archive/x 3.pdf");
        expect(freePath("", "a.b.epub", taken(["a.b.epub"]))).toBe("a.b 2.epub");
    });
    const ctx = (folders: string[], files: string[] = [], articles = "Clippings") => ({ articles, folderExists: (f: string) => folders.includes(f), exists: taken(files) });
    it("returns a book where it came from, to the root when that folder is gone, never over a file", () => {
        const record = { from: "Books/Tech/x.pdf", at: 1 };
        expect(returnTarget("Library archive/x.pdf", "paper", record, ctx(["Books/Tech"]))).toBe("Books/Tech/x.pdf");
        expect(returnTarget("Library archive/x.pdf", "paper", record, ctx([]))).toBe("x.pdf");
        expect(returnTarget("Library archive/x 2.pdf", "paper", record, ctx(["Books/Tech"], ["Books/Tech/x.pdf"]))).toBe("Books/Tech/x 2.pdf");
    });
    it("returns a book of unknown origin to the root", () => {
        expect(returnTarget("Library archive/x.pdf", "book", undefined, ctx(["Books"]))).toBe("x.pdf");
    });
    it("returns an article inside the articles folder, or not at all while articles are off", () => {
        expect(returnTarget("Library archive/a.md", "article", { from: "Clippings/Web/a.md", at: 1 }, ctx(["Clippings/Web"]))).toBe("Clippings/Web/a.md");
        expect(returnTarget("Library archive/a.md", "article", { from: "Elsewhere/a.md", at: 1 }, ctx(["Elsewhere"]))).toBe("Clippings/a.md");
        expect(returnTarget("Library archive/a.md", "article", undefined, ctx([]))).toBe("Clippings/a.md");
        expect(returnTarget("Library archive/a.md", "article", undefined, ctx([], [], ""))).toBeNull();
    });
});

describe("the book note keeps its book (#865 FR-24, AC-18)", () => {
    it("leaves a link that still finds the book", () => {
        expect(relinkBook("[[Library archive/x.pdf]]", "Library archive/x.pdf", (link) => link)).toBeNull();
    });
    it("rewrites a link that no longer finds it", () => {
        expect(relinkBook("[[Books/Tech/x.pdf]]", "Library archive/x.pdf", () => null)).toBe("[[Library archive/x.pdf]]");
        expect(relinkBook(undefined, "Books/x.pdf", () => null)).toBe("[[Books/x.pdf]]");
    });
});

describe("the record follows the file (#865 FR-10)", () => {
    const records = { "Library archive/x.pdf": { from: "Books/x.pdf", at: 7 } };
    it("re-keys inside the archive and forgets on leaving", () => {
        expect(followArchiveRecord(records, "Library archive/x.pdf", "Library archive/y.pdf", "Library archive")).toEqual({ "Library archive/y.pdf": { from: "Books/x.pdf", at: 7 } });
        expect(followArchiveRecord(records, "Library archive/x.pdf", "Books/x.pdf", "Library archive")).toEqual({});
        expect(followArchiveRecord(records, "Other/z.pdf", "Library archive/z.pdf", "Library archive")).toBe(records);
    });
    it("reads a hand-edited map forgivingly", () => {
        expect(normalizeArchiveRecords({ a: { from: "b", at: 1 }, c: { from: 3 }, d: null })).toEqual({ a: { from: "b", at: 1 } });
        expect(normalizeArchiveRecords("x")).toEqual({});
    });
});

describe("what Leave them leaves (#865 FR-5, AC-11)", () => {
    it("counts books and papers apart from articles", () => {
        expect(leaveOffer([item({}), item({ kind: "paper" }), item({ kind: "article" })])).toEqual({ sources: 2, articles: 1 });
    });
});

describe("where a book note's link leads (#865 FR-24, found in a real vault)", () => {
    const resolve = bookLinkResolver((path) => (path === "Books/x.pdf" ? path : null), (link) => (link === "x.pdf" ? "Books/x.pdf" : "Books/x.pdf"));
    it("takes a path that names a folder only as that exact path", () => {
        expect(resolve("Books/x.pdf")).toBe("Books/x.pdf");
        // Obsidian would find it by name; the note would show a path the book left.
        expect(resolve("Library archive/x.pdf")).toBeNull();
        expect(relinkBook("[[Library archive/x.pdf]]", "Books/x.pdf", resolve)).toBe("[[Books/x.pdf]]");
    });
    it("leaves a bare name to Obsidian", () => {
        expect(resolve("x.pdf")).toBe("Books/x.pdf");
        expect(relinkBook("[[x.pdf]]", "Books/x.pdf", resolve)).toBeNull();
    });
});
