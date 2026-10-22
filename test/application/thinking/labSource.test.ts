import { describe, it, expect } from "@jest/globals";
import type { Thought, ThoughtLocator } from "application/thinking/thought";
import { threadThoughts, type ThoughtNode } from "application/thinking/thread";
import { searchThreads } from "application/thinking/labSearch";
import {
    clearSources,
    composerSubject,
    dropLastSource,
    dropSource,
    labSources,
    noSources,
    pickSource,
    readingOrder,
    setOrder,
    sourceKind,
    sourcesOf,
    spinePositions,
    threadPlace,
} from "application/thinking/labSource";

const t = (over: Partial<Thought> & { id: string }): Thought => ({ at: 1, text: "", links: [], ...over });
const place = (at: number, label = `Ch. ${at + 1}`): ThoughtLocator => ({ at, label });

const BOOK = "Books/Thinking in Systems.epub";
const PDF = "Papers/metrics-paper.pdf";
const NOTE = "Notes/Stocks and flows.md";

const ids = (nodes: readonly ThoughtNode[]) => nodes.map((node) => node.thought.id);

describe("labSource — what a source is (#874 FR-1, AC-1)", () => {
    it("knows a book, a PDF and a note by their file", () => {
        expect(sourceKind(BOOK)).toBe("book");
        expect(sourceKind(PDF)).toBe("pdf");
        expect(sourceKind(NOTE)).toBe("note");
        expect(sourceKind("Clippings/an article.md")).toBe("note");
    });

    it("lists the sources thoughts are about, newest first, with no count", () => {
        const thoughts = [
            t({ id: "1", at: 10, about: BOOK }),
            t({ id: "2", at: 30, about: PDF }),
            t({ id: "3", at: 20, about: NOTE }),
            t({ id: "4", at: 40 }),
            t({ id: "5", at: 5, about: BOOK }),
        ];
        const sources = labSources(thoughts, { [BOOK]: { title: "Thinking in Systems" } });
        expect(sources.map((source) => [source.path, source.kind])).toEqual([
            [PDF, "pdf"],
            [NOTE, "note"],
            [BOOK, "book"],
        ]);
        expect(sources[2].name).toBe("Thinking in Systems");
        expect(sources[0].name).toBe("metrics-paper");
        expect(sources[2].newest).toBe(10);
        for (const source of sources) expect(Object.keys(source).sort()).toEqual(["kind", "name", "newest", "path"]);
    });

    it("reads only the thoughts it is handed — two arguments, no app, no vault", () => {
        expect(labSources.length).toBe(2);
        expect(labSources([], undefined)).toEqual([]);
    });
});

describe("labSource — what a thought is from (#874 FR-2, AC-2)", () => {
    it("counts a collision thought's second subject as a source", () => {
        expect(sourcesOf(t({ id: "c", about: BOOK, alsoAbout: NOTE }))).toEqual([BOOK, NOTE]);
        expect(sourcesOf(t({ id: "n" }))).toEqual([]);
    });

    it("keeps a whole thread, root included, when only its reply is from the source", () => {
        const root = t({ id: "r", at: 1 });
        const reply = t({ id: "a", at: 2, about: PDF, respondsTo: { to: "r", as: "fork" } });
        const found = searchThreads(threadThoughts([root, reply]), { sources: [PDF] });
        expect(ids(found)).toEqual(["r"]);
        expect(ids(found[0].children)).toEqual(["a"]);
    });
});

describe("labSource — reading order (#874 FR-10, AC-4, AC-5)", () => {
    it("goes by place, oldest first at the same place, the placeless last", () => {
        const roots = threadThoughts([
            t({ id: "p4", at: 3, about: BOOK, locator: place(4) }),
            t({ id: "p0", at: 1, about: BOOK, locator: place(0) }),
            t({ id: "p2-late", at: 2, about: BOOK, locator: place(2) }),
            t({ id: "p2-early", at: 0, about: BOOK, locator: place(2) }),
            t({ id: "none", at: 9, about: BOOK }),
        ]);
        const order = readingOrder(roots, [BOOK]);
        expect(ids(order.roots)).toEqual(["p0", "p2-early", "p2-late", "p4", "none"]);
        expect(order.heads.get(0)).toEqual([{ kind: "place", source: BOOK, label: "Ch. 1" }]);
        expect(order.heads.get(1)).toEqual([{ kind: "place", source: BOOK, label: "Ch. 3" }]);
        expect(order.heads.has(2)).toBe(false);
        expect(order.heads.get(3)).toEqual([{ kind: "place", source: BOOK, label: "Ch. 5" }]);
        expect(order.heads.get(4)).toEqual([{ kind: "unplaced", source: BOOK }]);
    });

    it("puts the print page after the chapter when it is known", () => {
        const roots = threadThoughts([
            t({ id: "b", at: 1, about: BOOK, locator: { at: 2, label: "Ch. 3", page: "41" } }),
            t({ id: "a", at: 2, about: BOOK, locator: { at: 2, label: "Ch. 3", page: "9" } }),
        ]);
        expect(ids(readingOrder(roots, [BOOK]).roots)).toEqual(["a", "b"]);
    });

    it("lays the sources out one after another, in the order picked, a head before each", () => {
        const roots = threadThoughts([
            t({ id: "book-1", at: 5, about: BOOK, locator: place(1) }),
            t({ id: "pdf-2", at: 4, about: PDF, locator: place(2, "p. 3") }),
            t({ id: "both", at: 3, about: BOOK, alsoAbout: PDF, locator: place(0) }),
            t({ id: "pdf-0", at: 2, about: PDF, locator: place(0, "p. 1") }),
        ]);
        const order = readingOrder(roots, [PDF, BOOK]);
        // `both` and `pdf-0` share the PDF's first page: the older one first.
        expect(ids(order.roots)).toEqual(["pdf-0", "both", "pdf-2", "book-1"]);
        expect(order.heads.get(0)?.[0]).toEqual({ kind: "source", source: PDF });
        expect(order.heads.get(3)?.[0]).toEqual({ kind: "source", source: BOOK });
        // The shared thread is shown once, under the first picked source it belongs to.
        expect(ids(order.roots).filter((id) => id === "both")).toHaveLength(1);
    });

    it("reads a note by date, newest first, with no place heads", () => {
        const roots = threadThoughts([
            t({ id: "old", at: 1, about: NOTE }),
            t({ id: "new", at: 9, about: NOTE }),
        ]);
        const order = readingOrder(roots, [NOTE]);
        expect(ids(order.roots)).toEqual(["new", "old"]);
        expect(order.heads.size).toBe(0);
    });

    it("keys every head by its root's index, so a block can start anywhere in the window", () => {
        const many = Array.from({ length: 30 }, (_unused, index) =>
            t({ id: `c${index}`, at: index, about: BOOK, locator: place(index < 25 ? 0 : 1) })
        );
        const order = readingOrder(threadThoughts(many), [BOOK]);
        expect(order.heads.get(25)).toEqual([{ kind: "place", source: BOOK, label: "Ch. 2" }]);
    });

    it("takes a thread's place from its root, else the earliest of its thoughts from the source", () => {
        const roots = threadThoughts([
            t({ id: "r", at: 1 }),
            t({ id: "a", at: 2, about: BOOK, locator: place(6), respondsTo: { to: "r", as: "fork" } }),
            t({ id: "b", at: 3, about: BOOK, locator: place(3), respondsTo: { to: "r", as: "fork" } }),
        ]);
        expect(threadPlace(roots[0], BOOK)?.at).toBe(3);
        const placed = threadThoughts([t({ id: "x", at: 1, about: BOOK, locator: place(8) })]);
        expect(threadPlace(placed[0], BOOK)?.at).toBe(8);
    });
});

describe("labSource — the spine (#874 FR-13, AC-7)", () => {
    const entries = [
        { id: "a", place: place(0) },
        { id: "b", place: place(3) },
        { id: "c", place: place(9) },
    ];

    it("spans the whole source when its length is known", () => {
        expect(spinePositions(entries, 12).map((entry) => entry.share)).toEqual([0, 0.25, 0.75]);
    });

    it("spans to the furthest place shown when it is not", () => {
        const shares = spinePositions(entries).map((entry) => entry.share);
        expect(shares[0]).toBe(0);
        expect(shares[1]).toBeCloseTo(1 / 3);
        expect(shares[2]).toBe(1);
    });

    it("carries the place's own label and nothing else", () => {
        for (const entry of spinePositions(entries, 12)) expect(Object.keys(entry).sort()).toEqual(["id", "label", "share"]);
        expect(spinePositions([{ id: "only", place: place(0) }])[0].share).toBe(0);
    });
});

describe("labSource — the filter's state (#874 FR-9, FR-14)", () => {
    it("starts in reading order whenever the first source is picked", () => {
        let state = pickSource(noSources(), BOOK);
        expect(state).toEqual({ picked: [BOOK], order: "reading" });
        state = setOrder(state, "newest");
        state = pickSource(state, PDF);
        expect(state).toEqual({ picked: [BOOK, PDF], order: "newest" });
        expect(pickSource(state, PDF)).toBe(state);
        state = clearSources(state);
        expect(state.picked).toEqual([]);
        expect(pickSource(setOrder(state, "newest"), NOTE).order).toBe("reading");
    });

    it("drops one source, or the last one picked", () => {
        const state = pickSource(pickSource(noSources(), BOOK), PDF);
        expect(dropSource(state, BOOK).picked).toEqual([PDF]);
        expect(dropLastSource(state).picked).toEqual([BOOK]);
        expect(dropLastSource(noSources()).picked).toEqual([]);
    });

    it("writes about the one source, and never picks one of several", () => {
        expect(composerSubject([BOOK], undefined)).toBe(BOOK);
        expect(composerSubject([BOOK], NOTE)).toBe(BOOK);
        expect(composerSubject([BOOK, PDF], NOTE)).toBe(NOTE);
        expect(composerSubject([BOOK, PDF], undefined)).toBeUndefined();
        expect(composerSubject([], NOTE)).toBe(NOTE);
    });
});
