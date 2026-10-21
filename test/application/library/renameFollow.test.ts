import { describe, it, expect } from "@jest/globals";
import { followSettings, isFollowedSource } from "application/library/renameFollow";

const meta = { size: 10, mtime: 20, chapter: 3, chapters: 9 };

describe("what follows a renamed source in plugin data (#810 FR-1, FR-3)", () => {
    it("moves the Library's knowledge, the layers and every resume entry keyed by the path", () => {
        const out = followSettings(
            {
                library: { "Books/a.epub": meta, "Books/b.pdf": meta },
                readerLayers: { "Books/a.epub": { target: "reflection", hidden: ["research"] } },
                readerResume: { "around:Books/a.epub": { chapter: 2, total: 5, at: 1 }, "selection:abc": { chapter: 1, total: 4, at: 2 } },
            },
            "Books/a.epub",
            "Books/Read/a.epub"
        );
        expect(out.changed).toBe(true);
        if (!out.changed) return;
        expect(Object.keys(out.library ?? {}).sort()).toEqual(["Books/Read/a.epub", "Books/b.pdf"]);
        expect(out.readerLayers).toEqual({ "Books/Read/a.epub": { target: "reflection", hidden: ["research"] } });
        expect(out.readerResume).toEqual({ "around:Books/Read/a.epub": { chapter: 2, total: 5, at: 1 }, "selection:abc": { chapter: 1, total: 4, at: 2 } });
    });

    it("says nothing changed for a book with no state", () => {
        const out = followSettings({ library: { "Books/b.pdf": meta }, readerLayers: {}, readerResume: { "selection:abc": { chapter: 1, total: 4, at: 2 } } }, "Books/a.epub", "Books/c.epub");
        expect(out).toEqual({ changed: false });
    });

    it("leaves a picked set's fingerprint alone: it names no path", () => {
        const out = followSettings({ readerResume: { "selection:Books/a.epub": { chapter: 1, total: 3, at: 1 } } }, "Books/a.epub", "Books/c.epub");
        expect(out.changed).toBe(false);
    });

    it("follows back to exactly where it started", () => {
        const start = { library: { "Books/a.epub": meta }, readerLayers: { "Books/a.epub": { target: "research" } } };
        const there = followSettings(start, "Books/a.epub", "B/a.epub");
        if (!there.changed) throw new Error("expected a change");
        const back = followSettings({ library: there.library, readerLayers: there.readerLayers }, "B/a.epub", "Books/a.epub");
        if (!back.changed) throw new Error("expected a change");
        expect(back.library).toEqual(start.library);
        expect(back.readerLayers).toEqual(start.readerLayers);
    });
});

describe("which renames are a source's (#810 FR-1, AC-8)", () => {
    it("a PDF or an EPUB, anywhere", () => {
        expect(isFollowedSource("a/b.pdf", "c/b.pdf", "Clippings")).toBe(true);
        expect(isFollowedSource("a/b.EPUB", "a/c.epub", "Clippings")).toBe(true);
    });

    it("an article: a note whose old or new path is in the articles folder", () => {
        expect(isFollowedSource("Clippings/x.md", "Clippings/y.md", "Clippings")).toBe(true);
        expect(isFollowedSource("Inbox/x.md", "Clippings/x.md", "Clippings")).toBe(true);
    });

    it("not an ordinary note, nor anything else", () => {
        expect(isFollowedSource("Notes/x.md", "Notes/y.md", "Clippings")).toBe(false);
        expect(isFollowedSource("Notes/x.md", "Notes/y.md", "")).toBe(false);
        expect(isFollowedSource("a/x.png", "a/y.png", "Clippings")).toBe(false);
    });
});

describe("the archive in a rename (#865 FR-10)", () => {
    it("follows an article moved inside the archive, or out of it", () => {
        expect(isFollowedSource("Library archive/a.md", "Library archive/b.md", "Clippings", "Library archive")).toBe(true);
        expect(isFollowedSource("Library archive/a.md", "Notes/a.md", "Clippings", "Library archive")).toBe(true);
        expect(isFollowedSource("Notes/a.md", "Notes/b.md", "Clippings", "Library archive")).toBe(false);
    });
    it("re-keys an archived thing's record inside the archive, and forgets it when it leaves", () => {
        const libraryArchive = { "Library archive/x.pdf": { from: "Books/x.pdf", at: 3 } };
        const inside = followSettings({ libraryArchive }, "Library archive/x.pdf", "Library archive/y.pdf", "Library archive");
        expect(inside.changed && inside.libraryArchive).toEqual({ "Library archive/y.pdf": { from: "Books/x.pdf", at: 3 } });
        const out = followSettings({ libraryArchive }, "Library archive/x.pdf", "Books/x.pdf", "Library archive");
        expect(out.changed && out.libraryArchive).toEqual({});
    });
});

describe("a stale copy never overwrites a fresh record (#865 review)", () => {
    it("leaves the archive map out of a change that did not touch it", () => {
        const out = followSettings({ library: { "Books/a.epub": meta }, libraryArchive: { "Library archive/x.pdf": { from: "B/x.pdf", at: 1 } } }, "Books/a.epub", "Library archive/a.epub", "Library archive");
        expect(out.changed).toBe(true);
        expect(out.changed && "libraryArchive" in out).toBe(false);
    });
});
