import { describe, it, expect } from "@jest/globals";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { memoStats } from "architecture/knowledge/model/memo";
import type { Idea } from "architecture/knowledge/model/Idea";
import { alongsideVocabulary, buildVocabulary, foldWords, isMatchableName, namedIn } from "architecture/knowledge/alongside/vocabulary";
import { nearPassage, type AlongsideThought } from "architecture/knowledge/alongside/near";

function note(path: string, title: string, extra: Partial<Idea> = {}): Idea {
    return {
        path,
        title,
        created: 0,
        modified: 0,
        state: "permanent",
        relations: [],
        claims: [],
        maturitySignals: { inDegree: 0, outDegree: 0, degree: 0, hasSources: false },
        ...extra,
    };
}

function modelOf(ideas: Idea[]): KnowledgeModel {
    const model = new KnowledgeModel();
    model.build(ideas);
    return model;
}

/**
 * The vault of the spec's walk: *Planning fallacy* (also called *planning bias*), *Ship early*, a
 * Spanish note with accents, and two titles that must never match — a common word and a short one.
 * The excluded folder's note is not in the model at all: scope keeps it out of the index (#529).
 */
const vault = () =>
    modelOf([
        note("Notes/Planning fallacy.md", "Planning fallacy", { aliases: ["planning bias"] }),
        note("Notes/Ship early.md", "Ship early"),
        note("Notes/Falacia de planificación.md", "Falacia de planificación"),
        note("Notes/Time.md", "Time"),
        note("Notes/The.md", "The"),
        note("Notes/People.md", "People"),
        note("Notes/Optimism.md", "Optimism"),
        note("Notes/Born here.md", "Born here"),
        note("Notes/Born elsewhere.md", "Born elsewhere"),
        note("Notes/Marked.md", "Marked"),
    ]);

const PASSAGE = "We fall for the planning fallacy, or Planning Bias, every time we ship. The time we spend is the time people lose.";

describe("the vocabulary Alongside matches against (#754 FR-3a, FR-15)", () => {
    it("folds case and accents, and reads whole words only", () => {
        expect(foldWords("Falacia de PLANIFICACIÓN, o no.")).toEqual(["falacia", "de", "planificacion", "o", "no"]);
        expect(foldWords("fallacy's fallacys")).toEqual(["fallacy", "s", "fallacys"]);
    });

    it("never matches a name made only of common words, or one short word", () => {
        expect(isMatchableName(["planning", "fallacy"])).toBe(true);
        expect(isMatchableName(["optimism"])).toBe(true);
        expect(isMatchableName(["time"])).toBe(false); // short
        expect(isMatchableName(["people"])).toBe(false); // common, though long
        expect(isMatchableName(["the", "end"])).toBe(false); // common words only
        expect(isMatchableName(["2024", "01"])).toBe(false); // no word at all
        expect(isMatchableName([])).toBe(false);
    });

    it("is built once per model revision, and again when the model moves", () => {
        const model = vault();
        const first = alongsideVocabulary(model);
        expect(alongsideVocabulary(model)).toBe(first);
        expect(memoStats(model).entries).toBeGreaterThan(0);
        model.upsert(note("Notes/New one.md", "New one"));
        expect(alongsideVocabulary(model)).not.toBe(first);
    });

    it("finds each title or alias named in a passage, once, in reading order", () => {
        const vocabulary = buildVocabulary(vault());
        expect(namedIn(vocabulary, PASSAGE)).toEqual(["Notes/Planning fallacy.md"]);
        expect(namedIn(vocabulary, "La falacia de planificacion, otra vez.")).toEqual(["Notes/Falacia de planificación.md"]);
        expect(namedIn(vocabulary, "Two planning fallacys and an optimism.")).toEqual(["Notes/Optimism.md"]);
    });
});

describe("what is near a passage (#754 FR-3, AC-1)", () => {
    const born = [
        { path: "Notes/Born elsewhere.md", chapterKey: "OEBPS/ch09.xhtml", label: "p. 201" },
        { path: "Notes/Born here.md", chapterKey: "OEBPS/ch03.xhtml", label: "p. 143" },
        { path: "Excluded/Born outside.md", chapterKey: "OEBPS/ch03.xhtml" },
    ];
    const mark: AlongsideThought = { id: "t1", text: "See [[Marked]]", about: "Books/b.epub", links: [{ to: "Notes/Marked.md" }], highlight: true, title: "a passage" };

    it("says why each note is here: named, born from this chapter, born from this book, marked", () => {
        const model = vault();
        const near = nearPassage(model, buildVocabulary(model), { text: PASSAGE, book: "Books/b.epub", bookTitle: "The book", chapterKey: "OEBPS/ch03.xhtml", born, marks: [mark] });
        expect(near).toEqual([
            { path: "Notes/Planning fallacy.md", title: "Planning fallacy", reason: "named" },
            { path: "Notes/Born here.md", title: "Born here", reason: "born-chapter", detail: "p. 143" },
            { path: "Notes/Born elsewhere.md", title: "Born elsewhere", reason: "born-book" },
            { path: "Notes/Marked.md", title: "Marked", reason: "mark", detail: "The book" },
        ]);
    });

    it("never offers a note outside the scope, a common or a short title", () => {
        const model = vault();
        const paths = nearPassage(model, buildVocabulary(model), { text: `${PASSAGE} The end.`, born }).map((item) => item.path);
        expect(paths).not.toContain("Excluded/Born outside.md");
        expect(paths).not.toContain("Notes/Time.md");
        expect(paths).not.toContain("Notes/The.md");
        expect(paths).not.toContain("Notes/People.md");
    });

    it("keeps one reason per note — the strongest — and leaves out what you ruled out here", () => {
        const model = vault();
        const vocabulary = buildVocabulary(model);
        const twice = nearPassage(model, vocabulary, { text: "Born here, again.", chapterKey: "OEBPS/ch03.xhtml", born });
        expect(twice.filter((item) => item.path === "Notes/Born here.md")).toEqual([{ path: "Notes/Born here.md", title: "Born here", reason: "named" }]);
        const ruled = nearPassage(model, vocabulary, { text: PASSAGE, ruledOut: new Set(["Notes/Planning fallacy.md"]) });
        expect(ruled).toEqual([]);
    });

    it("says *you linked it to this passage* when a source cites these words, here only (#762 FR-8)", () => {
        const model = vault();
        const vocabulary = buildVocabulary(model);
        const linked = [{ path: "Notes/Optimism.md", chapterKey: "OEBPS/ch09.xhtml", places: [{ chapterKey: "OEBPS/ch03.xhtml", quote: "Every   time we SHIP" }] }];
        const here = nearPassage(model, vocabulary, { text: PASSAGE, book: "Books/b.epub", chapterKey: "OEBPS/ch03.xhtml", born: linked });
        // The strongest reason after the chapter's own note: above *named*, and only once.
        expect(here[0]).toEqual({ path: "Notes/Optimism.md", title: "Optimism", reason: "linked-here" });
        expect(here.filter((item) => item.path === "Notes/Optimism.md")).toHaveLength(1);
        // Another chapter, or words the passage does not hold: born from the book, not linked here.
        const elsewhere = nearPassage(model, vocabulary, { text: PASSAGE, book: "Books/b.epub", chapterKey: "OEBPS/ch04.xhtml", born: linked });
        expect(elsewhere.find((item) => item.path === "Notes/Optimism.md")?.reason).toBe("born-book");
        const other = nearPassage(model, vocabulary, { text: "A different paragraph.", book: "Books/b.epub", chapterKey: "OEBPS/ch03.xhtml", born: linked });
        expect(other.find((item) => item.path === "Notes/Optimism.md")?.reason).toBe("born-book");
    });

    it("counts the chapter's own note as near in a note reading, and is the same twice", () => {
        const model = vault();
        const vocabulary = buildVocabulary(model);
        const input = { text: PASSAGE, chapterNote: "Notes/Ship early.md" };
        const first = nearPassage(model, vocabulary, input);
        expect(first[0]).toEqual({ path: "Notes/Ship early.md", title: "Ship early", reason: "chapter-note" });
        expect(nearPassage(model, vocabulary, input)).toEqual(first);
    });

    it("finds nothing near a passage that names nothing of yours", () => {
        const model = vault();
        expect(nearPassage(model, buildVocabulary(model), { text: "A sentence about nothing in particular." })).toEqual([]);
    });
});
