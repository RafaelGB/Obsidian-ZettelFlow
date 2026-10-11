import { describe, it, expect } from "@jest/globals";
import { citationOf, destinationsFor, planCrystallization, renderCrystallized } from "application/thinking/crystallize";
import { citedLocator, noteOrigins, notesBornFrom, pageOf } from "application/library/born";
import { ClaimSourceSchema } from "architecture/knowledge/claims/ClaimSourceSchema";
import { parseInlineFields } from "architecture/knowledge/parse/inlineFields";
import type { Thought } from "application/thinking/thought";

const highlight = (about: string, locator?: { at: number; label: string }, heading?: string): Thought => ({
    id: "h1",
    at: 1,
    text: "The case for flows: remove the mechanical, keep the thinking.",
    links: [],
    about,
    quote: { exact: "A general law of least effort applies to cognitive as well as physical exertion.", prefix: "", suffix: "", ...(heading ? { heading } : {}) },
    ...(locator ? { locator } : {}),
});

describe("from passage to note (#683)", () => {
    it("cites a book's passage by the file — extension kept, so the link resolves — and its page", () => {
        expect(citationOf(highlight("Books/Thinking, Fast and Slow.epub", { at: 41, label: "p. 42" }, "p. 42"))).toBe("[[Books/Thinking, Fast and Slow.epub]] p. 42");
        expect(citationOf(highlight("Books/tfs.epub", { at: 6, label: "3 · The lazy [controller]" }))).toBe("[[Books/tfs.epub]] 3 · The lazy controller");
        // A note's passage is cited as before: the note and its heading.
        expect(citationOf(highlight("Notes/Event sourcing.md", undefined, "Events"))).toBe("[[Notes/Event sourcing#Events]]");
    });

    it("writes a note that quotes the passage and is recognised as sourced by the book", () => {
        const plan = planCrystallization([highlight("Books/tfs.epub", { at: 41, label: "p. 42" })])!;
        const note = renderCrystallized(plan, plan.body, "Born from", (n) => `and ${n} more`);
        expect(note).toContain("> A general law of least effort applies to cognitive as well as physical exertion.");
        expect(note).toContain("source:: [[Books/tfs.epub]] p. 42");
        // The model reads it as a claim with a link source (#148)…
        const fields = parseInlineFields(note);
        const claims = new ClaimSourceSchema().parse({ path: "Zettel/Least effort.md", frontmatter: {}, inlineFields: fields, resolvedTargets: { "Books/tfs.epub": "Books/tfs.epub" } });
        expect(claims[0].sources).toEqual([{ ref: "Books/tfs.epub", kind: "link" }]);
        // …so the Library counts the note as born from the book.
        expect(notesBornFrom([{ path: "Zettel/Least effort.md", claims }]).get("Books/tfs.epub")).toEqual(["Zettel/Least effort.md"]);
    });

    it("never offers a PDF or an EPUB as a place to append thinking to (L5)", () => {
        expect(destinationsFor("Books/tfs.epub", true)).toEqual(["new-note"]);
        expect(destinationsFor("Papers/cap.pdf", true)).toEqual(["new-note"]);
        expect(destinationsFor("Notes/a.md", true)).toEqual(["back", "new-note"]);
    });

    it("reads where a note came from off its own source lines, inline and in the frontmatter", () => {
        const note = '---\nsource: "[[Papers/cap.pdf]] p. 6"\n---\nText.\n\nsource:: [[Books/tfs.epub]] p. 42\nsource:: [[Notes/other]]\nsource:: [[Books/tfs.epub]] p. 42\n';
        expect(noteOrigins(note)).toEqual([
            { link: "Papers/cap.pdf", locator: "p. 6" },
            { link: "Books/tfs.epub", locator: "p. 42" },
        ]);
        expect(citedLocator("[[x.pdf|The paper]] pp. 3")).toEqual({ link: "x.pdf", locator: "pp. 3" });
        expect(pageOf("p. 42")).toBe(41);
        expect(pageOf("pág. 7")).toBe(6);
        expect(pageOf("3 · The lazy controller")).toBeNull();
    });
});

describe("every note made from a book goes back to its paragraph (#751 FR-1, FR-4, AC-2, AC-8)", () => {
    const passage: Thought = {
        id: "h2",
        at: 2,
        text: "",
        links: [],
        about: "Books/tfs.epub",
        quote: { exact: "A general law of least effort applies to cognitive as well as physical exertion.", prefix: "the same thing. ", suffix: " The law asserts" },
        locator: { at: 6, label: "3 · The lazy controller", chapter: "OEBPS/ch03.xhtml", page: "143" },
    };

    it("writes the source list in the properties and still writes the source:: line", () => {
        const plan = planCrystallization([passage])!;
        const note = renderCrystallized(plan, plan.body, "Born from", (n) => `and ${n} more`);
        expect(note.startsWith("---\nsource:\n  - \"[[Books/tfs.epub#OEBPS/ch03.xhtml|tfs]] p. 143 · 3 · The lazy controller · “…the same thing. ‹A general law of least effort applies to cognitive as well as› physical exertion. The…”\"\n---\n")).toBe(true);
        expect(note).toContain("source:: [[Books/tfs.epub]] 3 · The lazy controller");
        // A flow's template owns the properties: its content has none.
        expect(renderCrystallized(plan, plan.body, "Born from", (n) => `and ${n} more`, false).startsWith("---")).toBe(false);
    });

    it("is still one link source for the claim parser, and still born from the book", () => {
        const plan = planCrystallization([passage])!;
        const note = renderCrystallized(plan, plan.body, "Born from", (n) => `and ${n} more`);
        const frontmatter = { source: [JSON.parse(note.split("\n")[2].slice(4)) as string] };
        const fields = parseInlineFields(note);
        const claims = new ClaimSourceSchema().parse({ path: "Zettel/Least effort.md", frontmatter, inlineFields: fields, resolvedTargets: { "Books/tfs.epub": "Books/tfs.epub" } });
        expect(claims[0].sources).toEqual([{ ref: "Books/tfs.epub", kind: "link" }]);
        expect(notesBornFrom([{ path: "Zettel/Least effort.md", claims }]).get("Books/tfs.epub")).toEqual(["Zettel/Least effort.md"]);
        // 3.6's own reader still parses the entry as a link and a locator.
        expect(citedLocator(frontmatter.source[0])?.link).toBe("Books/tfs.epub");
    });

    it("reads one origin with its place — the passage takes the row of its plain source:: line", () => {
        const plan = planCrystallization([passage])!;
        const note = renderCrystallized(plan, plan.body, "Born from", (n) => `and ${n} more`);
        const origins = noteOrigins(note);
        expect(origins).toHaveLength(1);
        expect(origins[0]).toMatchObject({ link: "Books/tfs.epub", locator: "p. 143", place: { chapter: "OEBPS/ch03.xhtml", page: "143", quote: { exact: expect.stringMatching(/^A general law/) } } });
        // The same, read off Obsidian's own properties.
        expect(noteOrigins(note, { source: [JSON.parse(note.split("\n")[2].slice(4)) as string] })).toEqual(origins);
        // Two passages of one book are two rows.
        const two = planCrystallization([passage, { ...passage, id: "h3", at: 3, quote: { exact: "System 2 is lazy.", prefix: "", suffix: "" } }])!;
        expect(noteOrigins(renderCrystallized(two, two.body, "Born from", (n) => `and ${n} more`))).toHaveLength(2);
    });

    it("reads a 3.6 note exactly as before: a link and a locator, no place", () => {
        expect(noteOrigins("Text.\n\nsource:: [[Books/tfs.epub]] 3 · The lazy controller\n")).toEqual([{ link: "Books/tfs.epub", locator: "3 · The lazy controller" }]);
        // A single-quoted or plain list, as another tool may re-write the properties.
        expect(noteOrigins("---\nsource:\n  - '[[Papers/cap.pdf#page=6|Cap]] p. 6 · “‹Partitions are rare›”'\n---\n")[0]).toMatchObject({ link: "Papers/cap.pdf", locator: "p. 6", place: { chapter: "page:5" } });
    });
});
