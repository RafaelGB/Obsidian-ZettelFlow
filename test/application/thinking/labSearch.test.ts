import { describe, it, expect } from "@jest/globals";
import type { Thought } from "application/thinking/thought";
import { threadThoughts } from "application/thinking/thread";
import { searchThreads, matchesThought, kindOf } from "application/thinking/labSearch";

const t = (over: Partial<Thought> & { id: string; text: string }): Thought => ({ at: 1, links: [], ...over });

describe("labSearch — find across body, tags, and subject (#596, AC-5)", () => {
    it("matches a term that lives only in the body", () => {
        expect(matchesThought(t({ id: "1", text: "speed is the real problem" }), { text: "speed" })).toBe(true);
    });

    it("matches a term that lives only in a tag, accent- and case-insensitive", () => {
        expect(matchesThought(t({ id: "1", text: "a plain note #Análisis" }), { text: "analisis" })).toBe(true);
    });

    it("matches a term that lives only in the subject-note name", () => {
        expect(
            matchesThought(t({ id: "1", text: "unrelated body", about: "Notes/Photosynthesis.md" }), {
                text: "photosynthesis",
            })
        ).toBe(true);
    });

    it("keeps a matching thread intact — an ancestor is kept for a matching child", () => {
        const root = t({ id: "r", text: "the question", at: 1 });
        const child = t({ id: "c", text: "answer about speed", at: 2, respondsTo: { to: "r", as: "fork" } });
        const found = searchThreads(threadThoughts([root, child]), { text: "speed" });
        expect(found).toHaveLength(1);
        expect(found[0].thought.id).toBe("r");
        expect(found[0].children[0].thought.id).toBe("c");
    });
});

describe("labSearch — set-aside matches are returned untouched (#596, AC-6)", () => {
    it("returns a matching set-aside thought without changing its incubation", () => {
        const aside = t({ id: "a", text: "an idea about speed", incubated: { reason: "not-now", at: 5 } });
        const found = searchThreads(threadThoughts([aside]), { text: "speed" });
        expect(found).toHaveLength(1);
        expect(found[0].thought.incubated).toEqual({ reason: "not-now", at: 5 });
    });
});

describe("labSearch — tag and kind facets, and the empty query (#596)", () => {
    it("requires the active tags to be present", () => {
        const thought = t({ id: "1", text: "note #design #speed" });
        expect(matchesThought(thought, { tags: ["design"] })).toBe(true);
        expect(matchesThought(thought, { tags: ["missing"] })).toBe(false);
    });

    it("restricts by kind", () => {
        const fork = t({ id: "1", text: "x", respondsTo: { to: "r", as: "fork" } });
        expect(kindOf(fork)).toBe("fork");
        expect(matchesThought(fork, { kind: "fork" })).toBe(true);
        expect(matchesThought(fork, { kind: "challenge" })).toBe(false);
        expect(matchesThought(t({ id: "2", text: "y" }), { kind: "plain" })).toBe(true);
    });

    it("an empty query narrows nothing", () => {
        const nodes = threadThoughts([t({ id: "1", text: "a" }), t({ id: "2", text: "b" })]);
        expect(searchThreads(nodes, {})).toHaveLength(2);
    });
});

describe("labSearch and ink (#745 E6)", () => {
    const ink = t({
        id: "i",
        text: "speed matters",
        about: "Books/a.epub",
        quote: { exact: "interface", prefix: "", suffix: "" },
        ink: { drawing: "1-i.svg", side: "right", x: 0.1, line: 0, em: 16 },
    });
    it("finds an ink note by its text", () => {
        expect(matchesThought(ink, { text: "speed" })).toBe(true);
    });
    it("never matches ink with a highlight's meaning filter", () => {
        expect(matchesThought(ink, { meaning: "idea" })).toBe(false);
        expect(matchesThought({ ...ink, ink: undefined }, { meaning: "idea" })).toBe(true);
    });
});

describe("labSearch — handwriting, once read (#748 AC-8)", () => {
    it("finds an ink note by the reading you accepted, which is its text", () => {
        const ink = t({ id: "i", text: "contradicts 'ship early'?", about: "Books/A book.epub", ink: { drawing: "1-i.svg", side: "text", x: 0, line: 0, em: 16 } });
        expect(matchesThought(ink, { text: "ship early" })).toBe(true);
        // Unread, the drawing alone is not searchable.
        expect(matchesThought({ ...ink, text: "" }, { text: "ship early" })).toBe(false);
    });
});
