import { describe, it, expect } from "@jest/globals";
import { filterThreads, flattenThread, threadedCount, threadThoughts } from "application/thinking/thread";
import { newThought, type ResponseKind, type Thought } from "application/thinking/thought";

const NOW = 1_700_000_000_000;

function at(id: string, offset: number, respondsTo?: { to: string; as: ResponseKind }): Thought {
    return newThought({ text: id, id, at: NOW + offset, ...(respondsTo ? { respondsTo } : {}) });
}

describe("thinking reads downward (#467 follow-up)", () => {
    it("puts a challenge under the thought it argues with, not at the top", () => {
        // The bug this exists for: a counterpoint written second appeared first, nowhere near
        // what it was answering.
        const idea = at("idea", 0);
        const against = at("against", 100, { to: "idea", as: "challenge" });
        const threads = threadThoughts([against, idea]);

        expect(threads).toHaveLength(1);
        expect(threads[0].thought.id).toBe("idea");
        expect(threads[0].children.map((child) => child.thought.id)).toEqual(["against"]);
        expect(threads[0].children[0].depth).toBe(1);
    });

    it("does the same for a fork, because they were always the same relation", () => {
        const threads = threadThoughts([at("idea", 0), at("variant", 100, { to: "idea", as: "fork" })]);
        expect(threads[0].children[0].thought.respondsTo?.as).toBe("fork");
    });

    it("reads a thread in the order you wrote it, oldest first", () => {
        const threads = threadThoughts([
            at("third", 300, { to: "idea", as: "challenge" }),
            at("idea", 0),
            at("first", 100, { to: "idea", as: "challenge" }),
            at("second", 200, { to: "idea", as: "fork" }),
        ]);
        expect(threads[0].children.map((child) => child.thought.id)).toEqual([
            "first",
            "second",
            "third",
        ]);
    });

    it("puts the thread you were just in first", () => {
        const threads = threadThoughts([at("old", 0), at("new", 500), at("middle", 250)]);
        expect(threads.map((node) => node.thought.id)).toEqual(["new", "middle", "old"]);
    });

    it("nests as deep as you actually went", () => {
        const threads = threadThoughts([
            at("a", 0),
            at("b", 100, { to: "a", as: "challenge" }),
            at("c", 200, { to: "b", as: "challenge" }),
            at("d", 300, { to: "c", as: "fork" }),
        ]);
        expect(threads[0].children[0].children[0].children[0].thought.id).toBe("d");
        expect(threads[0].children[0].children[0].children[0].depth).toBe(3);
    });

    it("keeps a response whose parent is gone, as a thread of its own", () => {
        // Losing a thought because its parent was thrown away would be the worst thing this
        // surface could do.
        const orphan = at("orphan", 100, { to: "deleted", as: "challenge" });
        const threads = threadThoughts([orphan]);
        expect(threads).toHaveLength(1);
        expect(threads[0].thought.id).toBe("orphan");
        expect(threads[0].depth).toBe(0);
    });

    it("never loses a thought, whatever shape the data is in", () => {
        const thoughts = [
            at("a", 0),
            at("b", 100, { to: "a", as: "fork" }),
            at("ghost", 200, { to: "nowhere", as: "challenge" }),
            at("c", 300),
        ];
        expect(threadedCount(threadThoughts(thoughts))).toBe(thoughts.length);
    });

    it("survives a thought that responds to itself", () => {
        const threads = threadThoughts([at("self", 0, { to: "self", as: "fork" })]);
        expect(threads).toHaveLength(1);
        expect(threads[0].children).toEqual([]);
    });

    it("survives a cycle a hand-edited file could create, instead of recursing forever", () => {
        const a = at("a", 0, { to: "b", as: "fork" });
        const b = at("b", 100, { to: "a", as: "challenge" });
        const threads = threadThoughts([a, b]);
        expect(threadedCount(threads)).toBe(2);
    });

    it("gives back an empty lab as an empty list", () => {
        expect(threadThoughts([])).toEqual([]);
    });

    it("flattens a thread root-first, for whoever needs the whole of it", () => {
        const threads = threadThoughts([
            at("a", 0),
            at("b", 100, { to: "a", as: "fork" }),
            at("c", 200, { to: "b", as: "challenge" }),
        ]);
        expect(flattenThread(threads[0]).map((thought) => thought.id)).toEqual(["a", "b", "c"]);
    });
});

describe("finding your way back (#477)", () => {
    function say(id: string, text: string, offset: number, to?: string): Thought {
        return newThought({
            text,
            id,
            at: NOW + offset,
            ...(to ? { respondsTo: { to, as: "challenge" as ResponseKind } } : {}),
        });
    }

    const threads = threadThoughts([
        say("a", "structure helps you think", 0),
        say("b", "too much of it kills the work", 100, "a"),
        say("c", "an unrelated thought about queues", 200),
    ]);

    it("returns everything, unchanged, when nothing is typed", () => {
        expect(filterThreads(threads, "")).toEqual(threads);
        expect(filterThreads(threads, "   ")).toEqual(threads);
    });

    it("narrows to what matches", () => {
        const found = filterThreads(threads, "queues");
        expect(found.map((node) => node.thought.id)).toEqual(["c"]);
    });

    it("keeps a matching answer with the thought it answers", () => {
        // An answer without its question is a fragment.
        const found = filterThreads(threads, "kills the work");
        expect(found).toHaveLength(1);
        expect(found[0].thought.id).toBe("a");
        expect(found[0].children.map((child) => child.thought.id)).toEqual(["b"]);
    });

    it("drops the answers that did not match, when the root did", () => {
        const found = filterThreads(threads, "structure");
        expect(found[0].thought.id).toBe("a");
        expect(found[0].children).toEqual([]);
    });

    it("ignores case and accents, because you will not remember which you typed", () => {
        const accented = threadThoughts([say("x", "análisis del problema", 0)]);
        expect(filterThreads(accented, "ANALISIS")).toHaveLength(1);
        expect(filterThreads(accented, "análisis")).toHaveLength(1);
    });

    it("says nothing matched, rather than showing everything", () => {
        expect(filterThreads(threads, "nothing like this")).toEqual([]);
    });

    it("never reorders — the newest thread is still the newest", () => {
        const found = filterThreads(threads, "t");
        expect(found.map((node) => node.thought.at)).toEqual(
            [...found].sort((a, b) => b.thought.at - a.thought.at).map((node) => node.thought.at)
        );
    });

    it("leaves the originals alone", () => {
        filterThreads(threads, "structure");
        expect(threads[1].children).toHaveLength(1);
    });
});
