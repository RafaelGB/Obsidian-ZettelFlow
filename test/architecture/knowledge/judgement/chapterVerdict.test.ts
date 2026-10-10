import { describe, it, expect } from "@jest/globals";
import { chapterVerdict, ruledOutInChapter, CHAPTER_SUBJECT_PREFIX } from "architecture/knowledge/judgement";
import type { Judgement } from "architecture/knowledge/judgement";

describe("not related, for one chapter of one book (#754 FR-9, AC-3)", () => {
    it("is one rejected, derived verdict about the note, naming the book and the chapter", () => {
        expect(chapterVerdict("Notes/Ship early.md", "Books/b.epub", "OEBPS/ch04.xhtml")).toEqual({
            path: "Notes/Ship early.md",
            subject: `${CHAPTER_SUBJECT_PREFIX}Books/b.epub#OEBPS/ch04.xhtml`,
            origin: "derived",
            verdict: "rejected",
        });
        expect(CHAPTER_SUBJECT_PREFIX).toBe("reader-not-related:");
    });

    it("rules the note out of that chapter only", () => {
        const history: Judgement[] = [{ at: 1, ...chapterVerdict("Notes/Ship early.md", "Books/b.epub", "OEBPS/ch04.xhtml") }];
        expect([...ruledOutInChapter(history, "Books/b.epub", "OEBPS/ch04.xhtml")]).toEqual(["Notes/Ship early.md"]);
        expect(ruledOutInChapter(history, "Books/b.epub", "OEBPS/ch09.xhtml").size).toBe(0);
        expect(ruledOutInChapter(history, "Books/other.epub", "OEBPS/ch04.xhtml").size).toBe(0);
    });

    it("ignores every other verdict, and a record edited by hand", () => {
        const history = [
            { at: 1, path: "Notes/a.md", subject: "reader-not-related:Books/b.epub#c1", origin: "derived", verdict: "accepted" },
            { at: 2, path: "Notes/b.md", subject: "gap:Notes/c.md", origin: "derived", verdict: "rejected" },
            { at: 3, path: "", subject: "reader-not-related:Books/b.epub#c1", origin: "derived", verdict: "rejected" },
            null,
            { nonsense: true },
            { at: 4, path: "Notes/d.md", subject: "reader-not-related:Books/b.epub#c1", origin: "derived", verdict: "rejected" },
        ] as unknown as Judgement[];
        expect([...ruledOutInChapter(history, "Books/b.epub", "c1")]).toEqual(["Notes/d.md"]);
        expect(ruledOutInChapter(undefined as unknown as Judgement[], "Books/b.epub", "c1").size).toBe(0);
    });
});
