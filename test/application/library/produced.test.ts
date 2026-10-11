import { describe, it, expect } from "@jest/globals";
import { PRODUCED_SHOWN, producedNothing, whatItProduced, type ProducedIdea, type ProducedInput, type ProducedThought } from "application/library/produced";

const BOOK = "Books/Thinking, Fast and Slow.epub";
const BOOK_NOTE = "Reading notes/Thinking, Fast and Slow.md";
const T0 = 1_700_000_000_000;
const DAY = 86_400_000;

function idea(path: string, created: number, relations: [string, string][] = []): ProducedIdea {
    return {
        path,
        title: (path.split("/").pop() ?? path).replace(/\.md$/, ""),
        created,
        relations: relations.map(([type, to]) => ({ type, to })),
    };
}

function mark(id: string, at: number, over: Partial<ProducedThought> = {}): ProducedThought {
    return { id, at, text: "", about: BOOK, quote: { exact: `passage ${id}`, prefix: "", suffix: "" } as never, locator: { at: 2, label: "Ch. 3" }, ...over };
}

/** The walk's vault (How to verify, preconditions), by hand. */
function vault(): ProducedInput {
    const ideas = [
        idea("Ideas/Note A.md", T0 + DAY, [
            ["link", BOOK],
            ["link", "Ideas/Planning fallacy.md"],
            ["supports", "Ideas/Planning fallacy.md"],
            ["link", "Ideas/Risk window.md"],
            ["question", "Questions/Why do plans slip.md"],
            ["link", "Ideas/Note B.md"],
        ]),
        idea("Ideas/Note B.md", T0 + 2 * DAY, [["link", "Ideas/Note A.md"]]),
        idea("Ideas/Planning fallacy.md", T0 - 300 * DAY),
        idea("Ideas/Risk window.md", T0 + 3 * DAY),
        idea("Ideas/Older view.md", T0 - 100 * DAY, [["contradicts", "Ideas/Note A.md"]]),
        idea("Questions/Why do plans slip.md", T0 - 10 * DAY),
        idea("Questions/Answered.md", T0 - 10 * DAY),
        // The book's note: kept in another folder, linking its book and its collections.
        idea(BOOK_NOTE, T0 + 5 * DAY, [
            ["link", BOOK],
            ["link", "Collections/Planning.md"],
            ["contradicts", "Ideas/Note A.md"],
        ]),
        idea("Collections/Planning.md", T0 + 6 * DAY),
        idea("Ideas/Unrelated.md", T0 + 9 * DAY, [["link", "Ideas/Planning fallacy.md"]]),
    ];
    const thoughts: ProducedThought[] = [
        mark("h1", T0, { incubated: { reason: "crystallized", at: T0 + DAY } }),
        mark("h2", T0 + 10, { meaning: "question", locator: { at: 4, label: "Ch. 5" }, links: [{ to: "Ideas/Planning fallacy.md" }, { to: "Ideas/Note A.md" }] }),
        mark("h3", T0 + 20, { locator: { at: 1, label: "Ch. 2" } }),
        mark("h4", T0 + 30, { incubated: { reason: "not-now", at: T0 + 40 } }),
        { id: "c1", at: T0 + 50, text: "I am not sure", about: BOOK, respondsTo: { to: "h3", as: "challenge" } },
        { id: "f1", at: T0 + 60, text: "a variant", about: BOOK, respondsTo: { to: "h2", as: "fork" } },
        // Ink and a move's answer are not marks.
        mark("ink", T0 + 70, { ink: { drawing: "d.svg", side: "left", x: 0, line: 0, em: 1 } as never }),
        mark("move", T0 + 80, { madeBy: { move: "connect" } }),
    ];
    return {
        kind: "source",
        sources: [BOOK],
        ideas,
        born: ["Ideas/Note A.md", "Ideas/Note B.md", BOOK_NOTE],
        bookNotes: new Set([BOOK_NOTE]),
        thoughts,
        openQuestions: [
            { path: "Questions/Why do plans slip.md", askedBy: ["Ideas/Note A.md"] },
            { path: "Questions/Elsewhere.md", askedBy: ["Ideas/Unrelated.md"] },
        ],
    };
}

const paths = (list: { path: string }[]) => list.map((item) => item.path);

function shuffled<T>(items: readonly T[]): T[] {
    return [...items].reverse().sort((a, b) => (JSON.stringify(a).length % 3) - (JSON.stringify(b).length % 3));
}

describe("whatItProduced (#752 AC-1)", () => {
    const lists = whatItProduced(vault());

    it("lists the notes born, never the book's note", () => {
        expect(paths(lists.born)).toEqual(["Ideas/Note A.md", "Ideas/Note B.md"]);
    });

    it("lists the ideas it led to: linked from a note born, made after the first reading, not citing", () => {
        expect(paths(lists.ideas)).toEqual(["Ideas/Risk window.md"]);
    });

    it("lists the links you made, typed when typed, never between two notes born", () => {
        const read = lists.links.map((pair) => [pair.a.kind === "note" ? pair.a.title : `highlight ${pair.a.thought.id}`, pair.b.title, pair.type ?? ""]);
        expect(read).toEqual([
            ["Note A", "Planning fallacy", "supports"],
            ["Note A", "Risk window", ""],
            ["Note A", "Why do plans slip", "question"],
            ["highlight h2", "Planning fallacy", ""],
        ]);
    });

    it("lists the tensions: contradicts either way, and highlights answered with a challenge", () => {
        const read = lists.tensions.map((item) => (item.kind === "pair" ? `${item.a.kind === "note" ? item.a.title : ""} ↔ ${item.b.title}` : `challenge ${item.thought.id} of ${item.highlight.id}`));
        expect(read).toEqual(["Older view ↔ Note A", "challenge c1 of h3"]);
    });

    it("lists the open questions asked by a note born", () => {
        expect(paths(lists.questions)).toEqual(["Questions/Why do plans slip.md"]);
    });

    it("lists what is still unresolved: marks neither crystallized nor set aside, in reading order", () => {
        expect(lists.unresolved.map((thought) => thought.id)).toEqual(["h3", "h2"]);
    });

    it("never lists the book's note, and its own links are not links you made", () => {
        const everywhere = JSON.stringify(lists);
        expect(everywhere).not.toContain(BOOK_NOTE);
        expect(everywhere).not.toContain("Collections/Planning.md");
        expect(everywhere).not.toContain(`"path":"${BOOK}"`);
    });

    it("is deduplicated and stable over shuffled input", () => {
        const input = vault();
        const again = whatItProduced({
            ...input,
            ideas: shuffled([...input.ideas]),
            born: shuffled([...input.born, "Ideas/Note A.md"]),
            thoughts: shuffled([...input.thoughts, input.thoughts[2]]),
            openQuestions: shuffled([...input.openQuestions, input.openQuestions[0]]),
        });
        expect(again).toEqual(lists);
    });

    it("shows five before Show all", () => {
        expect(PRODUCED_SHOWN).toBe(5);
    });
});

describe("whatItProduced, the shapes of a source (#752 AC-2, FR-5)", () => {
    const none: ProducedInput = { kind: "source", sources: [BOOK], ideas: [], born: [], bookNotes: new Set(), thoughts: [], openQuestions: [] };

    it("an empty vault gives no lists", () => {
        expect(producedNothing(whatItProduced(none))).toBe(true);
    });

    it("highlights only give Still unresolved only", () => {
        const lists = whatItProduced({ ...none, thoughts: [mark("h1", T0), mark("h2", T0 + 1)] });
        expect(lists.unresolved.map((t) => t.id)).toEqual(["h1", "h2"]);
        expect({ ...lists, unresolved: [] }).toEqual({ born: [], ideas: [], links: [], tensions: [], questions: [], unresolved: [] });
    });

    it("notes only give Notes born and what derives from them", () => {
        const lists = whatItProduced({
            ...none,
            ideas: [idea("A.md", T0, [["link", "Old.md"], ["link", "New.md"]]), idea("Old.md", T0 - DAY), idea("New.md", T0 + DAY)],
            born: ["A.md"],
        });
        expect(paths(lists.born)).toEqual(["A.md"]);
        expect(paths(lists.ideas)).toEqual(["New.md"]);
        expect(lists.links.map((pair) => pair.b.path)).toEqual(["New.md", "Old.md"]);
        expect(lists.unresolved).toEqual([]);
    });

    it("a source with neither a mark nor a dated note born has no ideas it led to", () => {
        const lists = whatItProduced({ ...none, ideas: [idea("A.md", 0, [["link", "New.md"]]), idea("New.md", T0)], born: ["A.md"] });
        expect(lists.ideas).toEqual([]);
        expect(lists.links).toHaveLength(1);
    });

    it("an article shares the code path: its own note is the source, never a target", () => {
        const article = "Clippings/The case for slow software.md";
        const lists = whatItProduced({
            ...none,
            sources: [article],
            ideas: [idea(article, T0 - DAY), idea("A.md", T0, [["link", article], ["link", "New.md"]]), idea("New.md", T0 + DAY)],
            born: ["A.md"],
        });
        expect(paths(lists.born)).toEqual(["A.md"]);
        expect(lists.links.map((pair) => pair.b.path)).toEqual(["New.md"]);
    });

    it("a saved path shows only Still unresolved, about its notes, in the order the path reads them", () => {
        const input = vault();
        const lists = whatItProduced({
            ...input,
            kind: "path",
            sources: ["b.md", "a.md"],
            thoughts: [mark("x", T0, { about: "a.md", locator: undefined }), mark("y", T0 + 5, { about: "b.md", locator: undefined })],
        });
        expect(lists.unresolved.map((t) => t.id)).toEqual(["y", "x"]);
        expect({ ...lists, unresolved: [] }).toEqual({ born: [], ideas: [], links: [], tensions: [], questions: [], unresolved: [] });
    });
});
