import { describe, it, expect } from "@jest/globals";
import {
    appearedSince,
    isIncubated,
    pickBackUp,
    setAside,
    type NoteFact,
} from "application/thinking/incubation";
import { newThought, parseThought, renderThought } from "application/thinking/thought";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const thought = newThought({ text: "structure versus freedom", id: "t1", at: NOW });

describe("setting something aside (#469)", () => {
    it("keeps the thought, and says why it was set down", () => {
        const aside = setAside(thought, "not-now", NOW + 100, "whether structure causes the freedom");
        expect(aside.text).toBe(thought.text);
        expect(aside.incubated).toEqual({
            reason: "not-now",
            at: NOW + 100,
            stuckOn: "whether structure causes the freedom",
        });
    });

    it("keeps a thought you decided against — a rejected conclusion is still your history", () => {
        const killed = setAside(thought, "decided-against", NOW, "the complexity was not worth it");
        expect(killed.text).toBe(thought.text);
        expect(killed.incubated?.reason).toBe("decided-against");
    });

    it("does not invent a stuck-on note you did not write", () => {
        expect(setAside(thought, "not-now", NOW).incubated?.stuckOn).toBeUndefined();
        expect(setAside(thought, "not-now", NOW, "   ").incubated?.stuckOn).toBeUndefined();
    });

    it("picking it back up leaves no trace of having been set down", () => {
        const back = pickBackUp(setAside(thought, "not-now", NOW, "x"));
        expect(isIncubated(back)).toBe(false);
        expect(back).toEqual(thought);
    });

    it("survives a round trip through the file", () => {
        const aside = setAside(thought, "decided-against", NOW + 5, "it needed a team");
        const back = parseThought(renderThought(aside), "lab/t1.md");
        expect(back.incubated).toEqual({
            reason: "decided-against",
            at: NOW + 5,
            stuckOn: "it needed a team",
        });
    });

    it("ignores a reason it does not recognise, rather than half-setting-aside", () => {
        const broken = renderThought(thought).replace("---\n\n", "  asideReason: maybe\n---\n\n");
        expect(parseThought(broken, "lab/t1.md").incubated).toBeUndefined();
    });
});

describe("what has appeared since (#469)", () => {
    const notes: NoteFact[] = [
        { path: "a.md", title: "Structure in software", created: NOW + DAY },
        { path: "b.md", title: "Something unrelated", created: NOW + 2 * DAY },
        { path: "c.md", title: "Freedom and constraint", created: NOW + 3 * DAY },
        { path: "old.md", title: "Structure again", created: NOW - DAY },
    ];

    it("names what was created after you set it down, and shares a word with it", () => {
        const found = appearedSince(notes, NOW, "structure versus freedom");
        expect(found.map((note) => note.path)).toEqual(["a.md", "c.md"]);
    });

    it("leaves out what already existed", () => {
        expect(appearedSince(notes, NOW, "structure").map((note) => note.path)).toEqual(["a.md"]);
    });

    it("says nothing when nothing did", () => {
        expect(appearedSince(notes, NOW + 10 * DAY, "structure")).toEqual([]);
    });

    it("returns them in the order they were created, never ranked", () => {
        // "This appeared since" is a fact. "This is now worth your time" is a judgement, and it
        // is yours (§XII) — so there is nothing here that could order by promise.
        const found = appearedSince(notes, NOW, "structure freedom");
        expect(found.map((note) => note.created)).toEqual([NOW + DAY, NOW + 3 * DAY]);
    });

    it("ignores short words, so 'the' does not match your whole vault", () => {
        expect(appearedSince(notes, NOW, "and the a of")).toEqual([]);
    });

    it("says nothing at all when you left no note of what you were stuck on", () => {
        expect(appearedSince(notes, NOW, "")).toEqual([]);
    });

    it("stops at a handful, because a welcome back is not a list of work", () => {
        const many: NoteFact[] = Array.from({ length: 30 }, (_, index) => ({
            path: `n${index}.md`,
            title: "structure something",
            created: NOW + index * 1000,
        }));
        expect(appearedSince(many, NOW, "structure")).toHaveLength(5);
    });
});
