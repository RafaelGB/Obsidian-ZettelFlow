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
