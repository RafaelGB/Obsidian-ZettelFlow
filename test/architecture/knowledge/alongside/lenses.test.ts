import { describe, it, expect } from "@jest/globals";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import type { Idea, Claim } from "architecture/knowledge/model/Idea";
import { buildVocabulary } from "architecture/knowledge/alongside/vocabulary";
import { nearPassage, type AlongsideThought } from "architecture/knowledge/alongside/near";
import { alongsideLenses, allOf, LENSES } from "architecture/knowledge/alongside/lenses";

function note(path: string, title: string, relations: { to: string; type?: string }[] = [], claims: Claim[] = []): Idea {
    return {
        path,
        title,
        created: 0,
        modified: 0,
        state: "permanent",
        relations: relations.map((r) => ({ type: r.type ?? "link", from: path, to: r.to })),
        claims,
        maturitySignals: { inDegree: 0, outDegree: relations.length, degree: relations.length, hasSources: false },
    };
}

/**
 * The spec's walk, as a model: *Planning fallacy* links *Optimism bias* and asks *Does this hold for
 * small teams?*; *Ship early* contradicts it; it carries one sourced and one unsourced claim; and
 * *Base rates* shares context with it without a link (both cited by *Forecasting*).
 */
function vault(): KnowledgeModel {
    const model = new KnowledgeModel();
    model.build([
        note("Notes/Planning fallacy.md", "Planning fallacy", [{ to: "Notes/Optimism bias.md" }, { to: "Notes/Small teams.md", type: "question" }], [
            { text: "Plans run late", sources: [{ ref: "Kahneman 2011", kind: "text" }] },
            { text: "Teams never learn", sources: [] },
        ]),
        note("Notes/Optimism bias.md", "Optimism bias"),
        note("Notes/Small teams.md", "Does this hold for small teams?"),
        note("Notes/Ship early.md", "Ship early", [{ to: "Notes/Planning fallacy.md", type: "contradicts" }]),
        note("Notes/Forecasting.md", "Forecasting", [{ to: "Notes/Planning fallacy.md" }, { to: "Notes/Base rates.md" }]),
        note("Notes/Base rates.md", "Base rates"),
        // A note whose only claim is itself: a `source` and no claim text, as the claim parser reads it.
        note("Notes/Reference class.md", "Reference class", [{ to: "Notes/Planning fallacy.md", type: "supports" }], [{ text: "Reference class", sources: [{ ref: "Books/b.epub", kind: "link" }] }]),
    ]);
    return model;
}

const BOOK = "Books/b.epub";
const thoughts: AlongsideThought[] = [
    // A highlight from another book whose margin note links the near note.
    { id: "h-other", text: "Same as [[Planning fallacy]]", about: "Books/other.epub", aboutTitle: "Another book", links: [{ to: "Notes/Planning fallacy.md" }], highlight: true, title: "Complexity is a reader's cost" },
    // A highlight in this book: it belongs to the page, not to *Your knowledge*.
    { id: "h-here", text: "planning fallacy again", about: BOOK, links: [], highlight: true, title: "here" },
    // A question highlight in this book.
    { id: "h-q", text: "", about: BOOK, links: [], highlight: true, meaning: "question", title: "Why do we never learn?" },
    // A fleeting thought that mentions the near note by name.
    { id: "t-fleeting", text: "Plans as cheap experiments — the planning fallacy says why", links: [], highlight: false, title: "Plans as cheap experiments" },
    // A thought about something else entirely.
    { id: "t-other", text: "Gardening on Sunday", links: [], highlight: false, title: "Gardening" },
];

function lensesFor(model = vault(), extra: Partial<Parameters<typeof alongsideLenses>[2]> = {}) {
    const vocabulary = buildVocabulary(model);
    const near = nearPassage(model, vocabulary, { text: "We fall for the planning fallacy every time.", book: BOOK });
    return alongsideLenses(model, near, { book: BOOK, vocabulary, thoughts, ...extra });
}

const titles = (items: { title: string }[]) => items.map((item) => item.title);

describe("six lenses over one list, each fed by an engine that already exists (#754 FR-5, AC-2)", () => {
    it("offers the six lenses in their order", () => {
        expect(LENSES).toEqual(["connections", "contradictions", "questions", "knowledge", "research", "unripe"]);
    });

    it("Connections: the near note, its neighbours, and an unlinked note sharing its context", () => {
        const lenses = lensesFor();
        expect(lenses.connections.map((item) => [item.title, item.why, item.detail])).toEqual([
            ["Planning fallacy", "named", undefined],
            ["Forecasting", "linked", "Planning fallacy"],
            ["Optimism bias", "linked", "Planning fallacy"],
            ["Reference class", "linked", "Planning fallacy"],
            ["Base rates", "shared", "Planning fallacy"],
        ]);
        // A contradiction is a tension and a question is a question, never a connection.
        expect(titles(lenses.connections)).not.toContain("Ship early");
        expect(titles(lenses.connections)).not.toContain("Does this hold for small teams?");
    });

    it("Contradictions: the contradicts relations touching a near note, each a tension", () => {
        const [item] = lensesFor().contradictions;
        expect(item).toMatchObject({ title: "Ship early", path: "Notes/Ship early.md", why: "contradicts", detail: "Planning fallacy", tension: true });
    });

    it("Questions: the open questions of a near note, then your question highlights in this book", () => {
        expect(lensesFor().questions.map((item) => [item.title, item.why])).toEqual([
            ["Does this hold for small teams?", "question"],
            ["Why do we never learn?", "highlight"],
        ]);
    });

    it("Your knowledge: the near notes named here, and your highlights from another book that link them", () => {
        expect(lensesFor().knowledge.map((item) => [item.title, item.why, item.detail])).toEqual([
            ["Planning fallacy", "named", undefined],
            ["Complexity is a reader's cost", "highlight", "Another book"],
        ]);
    });

    it("Research: a near note's sourced claims, and an unsourced claim said as unsourced", () => {
        expect(lensesFor().research.map((item) => [item.title, item.why, item.path, item.detail])).toEqual([
            ["Plans run late", "claim", "Notes/Planning fallacy.md", "Planning fallacy"],
            // The supporting note's claim is the note itself: it is the note, citing its source.
            ["Reference class", "cites", "Notes/Reference class.md", "b"],
            ["Teams never learn", "unsourced", "Notes/Planning fallacy.md", "Planning fallacy"],
        ]);
    });

    it("Not yet notes: the thoughts in Think that mention a near note, and nothing else", () => {
        expect(lensesFor().unripe.map((item) => [item.title, item.why, item.thought])).toEqual([["Plans as cheap experiments", "thought", "t-fleeting"]]);
    });

    it("All holds each item once, tagged with its first lens", () => {
        const all = allOf(lensesFor());
        const keys = all.map((item) => item.key);
        expect(new Set(keys).size).toBe(keys.length);
        const planning = all.filter((item) => item.path === "Notes/Planning fallacy.md" && !item.key.startsWith("claim:"));
        expect(planning.map((item) => item.lens)).toEqual(["connections"]);
        expect(all.find((item) => item.title === "Ship early")?.lens).toBe("contradictions");
        // A question is not a connection: it is held by Questions alone.
        expect(all.filter((item) => item.title === "Does this hold for small teams?").map((item) => item.lens)).toEqual(["questions"]);
    });

    it("leaves out a note ruled out for this chapter, in every lens", () => {
        const lenses = lensesFor(vault(), { ruledOut: new Set(["Notes/Ship early.md", "Notes/Optimism bias.md"]) });
        expect(lenses.contradictions).toEqual([]);
        expect(titles(lenses.connections)).not.toContain("Optimism bias");
    });

    it("is the same answer twice: ordered by why, then by title", () => {
        expect(lensesFor()).toEqual(lensesFor());
    });

    it("gives every lens an empty list when nothing is near — but your questions in this book stay", () => {
        const model = vault();
        const lenses = alongsideLenses(model, [], { book: BOOK, vocabulary: buildVocabulary(model), thoughts });
        for (const lens of LENSES.filter((one) => one !== "questions")) expect(lenses[lens]).toEqual([]);
        expect(titles(lenses.questions)).toEqual(["Why do we never learn?"]);
        expect(alongsideLenses(model, [], { vocabulary: buildVocabulary(model) }).questions).toEqual([]);
    });
});
