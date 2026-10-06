import { describe, it, expect } from "@jest/globals";
import {
    DETOUR_DEPTH,
    addToReading,
    placeInPath,
    plainExcerpt,
    popDetour,
    pushDetour,
} from "architecture/components/core/reader/readerDetours";
import type { ReadingPath } from "architecture/knowledge/state";

const path: ReadingPath = {
    seed: "a.md",
    kind: "around",
    chapters: [
        { path: "a.md", role: "thesis" },
        { path: "b.md", role: "support" },
        { path: "c.md", role: "counter" },
    ],
};

describe("detours (#670)", () => {
    it("pushes a detour, and one level back returns to where you left", () => {
        const one = pushDetour([], "x.md", "a.md");
        expect(one).toEqual(["x.md"]);
        const two = pushDetour(one, "y.md", "x.md");
        expect(two).toEqual(["x.md", "y.md"]);
        expect(popDetour(two)).toEqual(["x.md"]);
        expect(popDetour(popDetour(two))).toEqual([]);
    });

    it("does nothing when the detour is what you are already reading", () => {
        expect(pushDetour([], "a.md", "a.md")).toEqual([]);
        expect(pushDetour(["x.md"], "x.md", "x.md")).toEqual(["x.md"]);
    });

    it("never nests deeper than the cap: the newest replaces the deepest, the way back holds", () => {
        let stack: string[] = [];
        for (let i = 0; i < DETOUR_DEPTH + 3; i++) stack = pushDetour(stack, `n${i}.md`, stack[stack.length - 1] ?? "a.md");
        expect(stack).toHaveLength(DETOUR_DEPTH);
        expect(stack[0]).toBe("n0.md");
        expect(stack[stack.length - 1]).toBe(`n${DETOUR_DEPTH + 2}.md`);
    });
});

describe("where a note sits, and adding it (#670)", () => {
    it("finds a chapter, or says it is outside", () => {
        expect(placeInPath(path.chapters, "c.md")).toBe(2);
        expect(placeInPath(path.chapters, "z.md")).toBe(-1);
    });

    it("adds a note right after the current chapter, once", () => {
        const added = addToReading(path, 0, "z.md");
        expect(added.chapters.map((c) => c.path)).toEqual(["a.md", "z.md", "b.md", "c.md"]);
        expect(added.chapters[1].role).toBe("context");
        expect(addToReading(added, 2, "z.md")).toBe(added);
        expect(path.chapters).toHaveLength(3); // the original reading is untouched
    });
});

describe("a peek's excerpt (#670)", () => {
    it("is the first paragraph, as plain words", () => {
        const md = "---\nstate: fleeting\n---\n# Event sourcing\n\nState is **rebuilt** from [[Events|events]], see [the paper](http://x) and [[CQRS#Why]].\n\nSecond paragraph.";
        expect(plainExcerpt(md)).toBe("State is rebuilt from events, see the paper and CQRS.");
        expect(plainExcerpt("Intro line with `code` and ==mark==.\n\nMore.")).toBe("Intro line with code and mark.");
        expect(plainExcerpt("State is **rebuilt** from [[Events|events]], see [the paper](http://x) and [[CQRS#Why]].")).toBe(
            "State is rebuilt from events, see the paper and CQRS."
        );
    });

    it("skips embeds, code and inline fields, and cuts long text at a word", () => {
        expect(plainExcerpt("![[pic.png]]\n\n```js\nx\n```\n\nsource:: [[Book]]\n\nThe real text.")).toBe("The real text.");
        const long = "word ".repeat(100);
        const cut = plainExcerpt(long, 50);
        expect(cut.endsWith("…")).toBe(true);
        expect(cut.length).toBeLessThanOrEqual(51);
        expect(plainExcerpt("")).toBe("");
    });
});
