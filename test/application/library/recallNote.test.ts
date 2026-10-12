import { describe, it, expect } from "@jest/globals";
import { recallCitation, recallPlan, recallWords, renderRecallNote } from "application/library/recallNote";
import { renderCrystallized } from "application/thinking/crystallize";
import { noteOrigins, notesBornFrom } from "application/library/born";
import { ClaimSourceSchema } from "architecture/knowledge/claims/ClaimSourceSchema";
import { parseInlineFields } from "architecture/knowledge/parse/inlineFields";

/**
 * **Recall's note** (#760 AC-3, AC-5): your words exactly as you typed them, then the one line that
 * says where they came from — and nothing of the book you did not type yourself.
 */

const BOOK = { file: "Books/tfs.epub", chapter: "OEBPS/ch03.xhtml", label: "3 · The lazy controller", bookTitle: "Thinking, Fast and Slow" };

const claimsOf = (note: string, path: string, resolved: Record<string, string>) =>
    new ClaimSourceSchema().parse({ path, frontmatter: {}, inlineFields: parseInlineFields(note), resolvedTargets: resolved });

describe("your words, exactly (#760 AC-3)", () => {
    it("keeps a typo, unicode and blank lines inside byte-for-byte; only trailing whitespace goes", () => {
        const typed = "  System 2 is lazzy — it saves effort.\n\n\nÉmile's «law» of least effort ✍️\t \n\n  ";
        expect(recallWords(typed)).toBe("  System 2 is lazzy — it saves effort.\n\n\nÉmile's «law» of least effort ✍️");
        const note = renderRecallNote(typed, recallCitation(BOOK));
        expect(note.startsWith("  System 2 is lazzy — it saves effort.\n\n\nÉmile's «law» of least effort ✍️\n\nsource:: ")).toBe(true);
    });

    it("ends with the source:: line, and nothing after it", () => {
        const note = renderRecallNote("What stayed.", recallCitation(BOOK));
        const lines = note.trimEnd().split("\n");
        expect(lines[lines.length - 1]).toBe("source:: [[Books/tfs.epub#OEBPS/ch03.xhtml|Thinking, Fast and Slow]] · 3 · The lazy controller");
        expect(note.endsWith("\n")).toBe(true);
        expect(note.match(/source::/g)).toHaveLength(1);
    });

    it("never carries a passage you did not type: the citation names the chapter, not a quote", () => {
        const citation = recallCitation(BOOK);
        expect(citation).not.toMatch(/[‹›“”]/);
        expect(renderRecallNote("Mine.", citation)).toBe(`Mine.\n\nsource:: ${citation}\n`);
    });

    it("cites a paper's section by its first page, and an article's by its heading", () => {
        expect(recallCitation({ file: "Papers/cap.pdf", chapter: "page:11", label: "Partitions", page: "12", bookTitle: "CAP" })).toBe("[[Papers/cap.pdf#page=12|CAP]] p. 12");
        expect(recallCitation({ file: "Papers/cap.pdf", chapter: "page:11", label: "Partitions" })).toBe("[[Papers/cap.pdf#page=12|cap]]");
        expect(recallCitation({ file: "Clippings/The case for slow software.md", label: "Speed [is] a feature" })).toBe("[[Clippings/The case for slow software]] Speed is a feature");
    });

    it("is what a crystallize flow is seeded with, too: the same words and the same line", () => {
        const plan = recallPlan("Prelude — in my words", "What stayed.", recallCitation(BOOK));
        expect(plan.frozen).toEqual([]);
        expect(plan.places).toEqual([]);
        expect(renderCrystallized(plan, plan.body, "Born from", (n) => `and ${n} more`, false)).toBe(renderRecallNote("What stayed.", recallCitation(BOOK)));
    });
});

describe("the note is born from the book (#760 AC-5)", () => {
    it("counts for the book in notesBornFrom, through the claim parser", () => {
        const note = renderRecallNote("What stayed.", recallCitation(BOOK));
        const claims = claimsOf(note, "Recall.md", { "Books/tfs.epub": "Books/tfs.epub" });
        expect(claims[0].sources).toEqual([{ ref: "Books/tfs.epub", kind: "link" }]);
        expect(notesBornFrom([{ path: "Recall.md", claims }]).get("Books/tfs.epub")).toEqual(["Recall.md"]);
        // The Library's row reads where in the book it came from: the chapter.
        expect(noteOrigins(note)[0]).toMatchObject({ link: "Books/tfs.epub", place: { chapter: "OEBPS/ch03.xhtml" } });
    });

    it("counts for an article through the shelf's resolver (#744)", () => {
        const article = "Clippings/The case for slow software.md";
        const note = renderRecallNote("Slow is a choice.", recallCitation({ file: article, label: "Speed" }));
        const claims = claimsOf(note, "Recall.md", { "Clippings/The case for slow software": article });
        expect(claims[0].sources[0]).toMatchObject({ kind: "link" });
        const ref = claims[0].sources[0].ref;
        const born = notesBornFrom([{ path: "Recall.md", claims }], new Set(), (r) => (r === ref ? article : null));
        expect(born.get(article)).toEqual(["Recall.md"]);
    });
});
