import { describe, it, expect } from "@jest/globals";
import type { Thought } from "application/thinking/thought";
import { buildNotebook, filterNotebook, readingNoteMarkdown } from "application/library/notebook";

const BOOK = "Books/aposd.epub";
const label = (at: number) => [`Ch. 1 · Introduction`, `Ch. 2 · Complexity`, `Ch. 4 · Deep modules`][at] ?? `Ch. ${at + 1}`;

function highlight(id: string, at: number, exact: string, text = "", meaning?: Thought["meaning"], when = 0): Thought {
    return {
        id,
        at: when,
        text,
        links: [],
        about: BOOK,
        quote: { exact, prefix: "", suffix: "" },
        locator: { at, label: label(at) },
        ...(meaning ? { meaning } : {}),
    } as Thought;
}

const THOUGHTS = [
    highlight("h3", 2, "A deep module hides far more than it shows.", "Depth: what it hides minus what it asks", "idea", 30),
    highlight("h1", 1, "Complexity is whatever makes a system hard to understand.", "", "quote", 10),
    highlight("h2", 1, "Dependencies and obscurity are the two causes.", "Are there really only two?", "question", 20),
    // A note in the margin of a page with no text: a place, and no passage.
    { id: "n1", at: 40, text: "The figure on this page matters.", links: [], about: BOOK, locator: { at: 2, label: label(2) } } as Thought,
];

describe("the book notebook — everything you marked in one book (#721)", () => {
    it("groups by chapter in reading order, and keeps the order you marked within one", () => {
        const book = buildNotebook(THOUGHTS, label);
        expect(book.groups.map((g) => g.title)).toEqual(["Ch. 2 · Complexity", "Ch. 4 · Deep modules"]);
        expect(book.groups[0].entries.map((e) => e.id)).toEqual(["h1", "h2"]);
        expect(book.groups[1].entries.map((e) => e.id)).toEqual(["h3", "n1"]);
    });

    it("counts what you marked: highlights, notes, and each meaning — an old highlight as an idea", () => {
        const book = buildNotebook([...THOUGHTS, highlight("old", 0, "An old highlight.")], label);
        expect(book.highlights).toBe(4);
        expect(book.notes).toBe(3);
        expect(book.byMeaning).toEqual({ idea: 2, question: 1, quote: 1, discuss: 0 });
    });

    it("narrows to one meaning, or to what carries a note, and drops a chapter left empty", () => {
        const book = buildNotebook(THOUGHTS, label);
        expect(filterNotebook(book.groups, { meaning: "question" }).flatMap((g) => g.entries.map((e) => e.id))).toEqual(["h2"]);
        const withNotes = filterNotebook(book.groups, { withNotes: true });
        expect(withNotes.flatMap((g) => g.entries.map((e) => e.id))).toEqual(["h2", "h3", "n1"]);
        expect(filterNotebook(book.groups, { meaning: "discuss" })).toEqual([]);
    });

    it("writes a reading note: a title, the source, then each chapter's quotes and your notes", () => {
        const book = buildNotebook(THOUGHTS, label);
        const md = readingNoteMarkdown({ title: "A Philosophy of Software Design", sourceLink: "[[aposd.epub|A Philosophy of Software Design]]", groups: book.groups });
        expect(md).toBe(
            [
                "# A Philosophy of Software Design",
                "",
                "Source:: [[aposd.epub|A Philosophy of Software Design]]",
                "",
                "## Ch. 2 · Complexity",
                "",
                "> Complexity is whatever makes a system hard to understand.",
                "",
                "> Dependencies and obscurity are the two causes.",
                "",
                "- Are there really only two?",
                "",
                "## Ch. 4 · Deep modules",
                "",
                "> A deep module hides far more than it shows.",
                "",
                "- Depth: what it hides minus what it asks",
                "",
                "- The figure on this page matters.",
                "",
            ].join("\n")
        );
    });

    it("cites the page under its section in a paper, and never writes a block id", () => {
        const paper = [
            { id: "p", at: 0, text: "", links: [], about: "Papers/cap.pdf", quote: { exact: "It is impossible.\nTruly.", prefix: "", suffix: "" }, locator: { at: 8, label: "p. 9" } } as Thought,
        ];
        const book = buildNotebook(paper, () => "p. 9", () => "3. Asynchronous networks");
        const md = readingNoteMarkdown({ title: "CAP", sourceLink: "[[cap.pdf]]", groups: book.groups });
        expect(md).toContain("## 3. Asynchronous networks");
        expect(md).toContain("> It is impossible.\n> Truly. (p. 9)");
        expect(md).not.toMatch(/\^\w/);
    });
});
