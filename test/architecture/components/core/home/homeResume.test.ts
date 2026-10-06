import { describe, it, expect } from "@jest/globals";
import { readingInProgress } from "architecture/components/core/home/homeResume";
import { readingKey } from "architecture/components/core/reader/readerResume";

/**
 * **The reading in progress** (#703) — one of the cards under *Where you left off*: the most recent
 * unfinished reading across note readings, saved sets and the shelf.
 */
describe("the reading in progress (#703)", () => {
    it("is nothing when nothing is half-read", () => {
        expect(readingInProgress(null)).toBeNull();
        expect(readingInProgress({})).toBeNull();
        // A reading on its first or last chapter is not in progress.
        expect(readingInProgress({ readerResume: { "around:a.md": { chapter: 0, total: 5, at: 10 } } })).toBeNull();
    });

    it("picks the most recent across notes, saved sets and the shelf", () => {
        const paths = ["n/a.md", "n/b.md", "n/c.md"];
        const settings = {
            readerResume: {
                "argument:n/x.md": { chapter: 2, total: 6, at: 100 },
                [readingKey("selection", "n/a.md", paths)]: { chapter: 1, total: 3, at: 300 },
            },
            readerSaved: [{ id: "r1", name: "Distributed systems", kind: "selection", seed: "n/a.md", paths, at: 5 }],
            library: { "Books/b.epub": { size: 1, mtime: 2, title: "Make It Stick", chapters: 8, chapter: 2, at: 200 } },
        };
        expect(readingInProgress(settings)).toEqual({
            title: "Distributed systems",
            chapter: 1,
            total: 3,
            at: 300,
            open: { kind: "saved", seed: "n/a.md", paths, name: "Distributed systems" },
        });
        const noSaved = { ...settings, readerSaved: [] };
        // An unnamed picked set cannot be rebuilt from its fingerprint, so the book comes next.
        expect(readingInProgress(noSaved)?.open).toEqual({ kind: "source", path: "Books/b.epub" });
        expect(readingInProgress(noSaved)?.title).toBe("Make It Stick");
    });

    it("opens a note reading the way it was read", () => {
        const result = readingInProgress({ readerResume: { "story:Notes/Raft.md": { chapter: 3, total: 9, at: 1 } } });
        expect(result).toMatchObject({ title: "Raft", chapter: 3, total: 9, open: { kind: "note", seed: "Notes/Raft.md", reading: "story" } });
    });

    it("leaves out a book you finished", () => {
        expect(
            readingInProgress({ library: { "a.pdf": { size: 1, mtime: 2, chapters: 4, chapter: 3, at: 9, done: true } } })
        ).toBeNull();
    });
});
