import { describe, it, expect } from "@jest/globals";
import {
    LAB_FRONTMATTER_KEY,
    linkThoughts,
    newThought,
    orderThoughts,
    parseThought,
    renderThought,
    thoughtPath,
    type Thought,
} from "application/thinking/thought";

const NOW = 1_700_000_000_000;

describe("a thought asks nothing of you (#466)", () => {
    it("exists with nothing but its text", () => {
        const thought = newThought({ text: "maybe speed is the real problem", id: "t1", at: NOW });
        expect(thought.text).toBe("maybe speed is the real problem");
        expect(thought.id).toBe("t1");
        expect(thought.at).toBe(NOW);
        expect(thought.links).toEqual([]);
    });

    it("has no title, no state and no lifecycle — the very things a note demands", () => {
        const thought = newThought({ text: "three words here", id: "t1", at: NOW });
        for (const absent of ["title", "state", "status", "lifecycle"]) {
            expect(Object.keys(thought)).not.toContain(absent);
        }
    });

    it("accepts three words, a contradiction, or something deliberately wrong", () => {
        for (const text of ["no", "A and not A", "   ", "this is wrong on purpose"]) {
            expect(newThought({ text, id: "t", at: NOW }).text).toBe(text);
        }
    });

    it("links two thoughts, without either becoming the other's parent", () => {
        const first = newThought({ text: "one", id: "t1", at: NOW });
        const second = newThought({ text: "two", id: "t2", at: NOW + 1 });
        const [a, b] = linkThoughts(first, second);
        expect(a.links).toEqual([{ to: "t2" }]);
        expect(b.links).toEqual([{ to: "t1" }]);
    });

    it("does not link the same pair twice", () => {
        const first = newThought({ text: "one", id: "t1", at: NOW });
        const second = newThought({ text: "two", id: "t2", at: NOW + 1 });
        const [once] = linkThoughts(first, second);
        const [twice] = linkThoughts(once, second);
        expect(twice.links).toEqual([{ to: "t2" }]);
    });

    it("records a fork and a challenge as what they are, not as a verdict", () => {
        const origin = newThought({ text: "structure helps", id: "t1", at: NOW });
        const fork = newThought({ text: "or does it", id: "t2", at: NOW + 1, forkedFrom: origin.id });
        const against = newThought({ text: "too much kills it", id: "t3", at: NOW + 2, challenges: origin.id });
        expect(fork.forkedFrom).toBe("t1");
        expect(against.challenges).toBe("t1");
        // Neither side is marked right, wrong, resolved or preferred.
        expect(Object.keys(against)).not.toContain("resolved");
    });

    it("keeps the newest first, which is where you were just working", () => {
        const thoughts: Thought[] = [
            newThought({ text: "old", id: "t1", at: NOW }),
            newThought({ text: "new", id: "t2", at: NOW + 100 }),
            newThought({ text: "middle", id: "t3", at: NOW + 50 }),
        ];
        expect(orderThoughts(thoughts).map((t) => t.id)).toEqual(["t2", "t3", "t1"]);
    });
});

describe("a thought is a file you can open (#466)", () => {
    it("puts the text in the body, so Obsidian shows what you wrote", () => {
        const rendered = renderThought(newThought({ text: "just this", id: "t1", at: NOW }));
        expect(rendered.endsWith("just this\n")).toBe(true);
        expect(rendered.startsWith("---\n")).toBe(true);
        expect(rendered).toContain(LAB_FRONTMATTER_KEY);
    });

    it("round-trips text containing frontmatter fences and wiki links", () => {
        const text = "a line\n---\n[[a link]] and `code`";
        const thought = newThought({ text, id: "t1", at: NOW });
        expect(parseThought(renderThought(thought), "lab/t1.md").text).toBe(text);
    });

    it("round-trips the links, the fork and the challenge", () => {
        const thought: Thought = {
            ...newThought({ text: "x", id: "t1", at: NOW }),
            links: [{ to: "t2" }, { to: "t3" }],
            forkedFrom: "t9",
            challenges: "t8",
        };
        const back = parseThought(renderThought(thought), "lab/t1.md");
        expect(back.links).toEqual([{ to: "t2" }, { to: "t3" }]);
        expect(back.forkedFrom).toBe("t9");
        expect(back.challenges).toBe("t8");
    });

    it("reads a file with no frontmatter at all as just text, rather than failing", () => {
        // Someone will write a note in this folder by hand. That is allowed, and it is a thought.
        const back = parseThought("something I typed in Obsidian\n", "lab/loose.md");
        expect(back.text).toBe("something I typed in Obsidian");
        expect(back.id).toBe("lab/loose.md");
        expect(back.links).toEqual([]);
    });

    it("degrades malformed frontmatter to just text instead of throwing", () => {
        const back = parseThought("---\nzfThought: [[[\n---\nthe text\n", "lab/broken.md");
        expect(back.text).toBe("the text");
        expect(back.links).toEqual([]);
    });

    it("names the file after when it was written, never after a title", () => {
        const path = thoughtPath("_ZettelFlow/lab", newThought({ text: "x", id: "abc123", at: NOW }));
        expect(path.startsWith("_ZettelFlow/lab/")).toBe(true);
        expect(path.endsWith(".md")).toBe(true);
        expect(path).toContain("abc123");
    });
});
