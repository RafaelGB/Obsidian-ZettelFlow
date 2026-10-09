import { describe, it, expect } from "@jest/globals";
import {
    LAB_FRONTMATTER_KEY,
    isHighlight,
    isInk,
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

    it("records a fork and a challenge as one relation with two flavours", () => {
        // They were two fields saying the same thing — *which thought is this a response to* —
        // and storing them apart is what made them impossible to lay out together.
        const origin = newThought({ text: "structure helps", id: "t1", at: NOW });
        const fork = newThought({
            text: "or does it",
            id: "t2",
            at: NOW + 1,
            respondsTo: { to: origin.id, as: "fork" },
        });
        const against = newThought({
            text: "too much kills it",
            id: "t3",
            at: NOW + 2,
            respondsTo: { to: origin.id, as: "challenge" },
        });
        expect(fork.respondsTo).toEqual({ to: "t1", as: "fork" });
        expect(against.respondsTo).toEqual({ to: "t1", as: "challenge" });
        // Neither side is marked right, wrong, resolved or preferred.
        expect(Object.keys(against)).not.toContain("resolved");
    });

    it("answers at most one thought, which is what makes the lab a set of threads", () => {
        const thought = newThought({
            text: "x",
            id: "t1",
            at: NOW,
            respondsTo: { to: "t0", as: "challenge" },
        });
        expect(Object.keys(thought)).not.toContain("forkedFrom");
        expect(Object.keys(thought)).not.toContain("challenges");
    });

    it("can be about a note, without becoming one", () => {
        const thought = newThought({ text: "is this actually true?", id: "t1", at: NOW, about: "Notes/kafka.md" });
        expect(thought.about).toBe("Notes/kafka.md");
        // A subject, not a link: the thought is still not knowledge, and crossing wrote nothing.
        expect(Object.keys(thought)).not.toContain("links_to_note");
    });

    it("is about nothing by default, which is the normal case", () => {
        expect(newThought({ text: "x", id: "t1", at: NOW }).about).toBeUndefined();
    });

    it("round-trips its subject through the file", () => {
        const thought = newThought({ text: "x", id: "t1", at: NOW, about: "Notes/a b.md" });
        expect(parseThought(renderThought(thought), "lab/t1.md").about).toBe("Notes/a b.md");
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

    it("round-trips the links and the response", () => {
        const thought: Thought = {
            ...newThought({ text: "x", id: "t1", at: NOW }),
            links: [{ to: "t2" }, { to: "t3" }],
            respondsTo: { to: "t9", as: "challenge" },
        };
        const back = parseThought(renderThought(thought), "lab/t1.md");
        expect(back.links).toEqual([{ to: "t2" }, { to: "t3" }]);
        expect(back.respondsTo).toEqual({ to: "t9", as: "challenge" });
    });

    it("reads a lab written before the two fields became one", () => {
        // A read-only migration: the next save writes the new shape, and the old keys are never
        // produced again. Someone's thoughts should not lose their threads to a refactor.
        const old = "---\nzfThought:\n  id: t1\n  at: 5\n  links: []\n  forkedFrom: t9\n---\n\nthe text\n";
        expect(parseThought(old, "lab/t1.md").respondsTo).toEqual({ to: "t9", as: "fork" });

        const argued = old.replace("forkedFrom: t9", "challenges: t8");
        expect(parseThought(argued, "lab/t1.md").respondsTo).toEqual({ to: "t8", as: "challenge" });
    });

    it("ignores a response whose flavour it does not recognise", () => {
        const broken = "---\nzfThought:\n  id: t1\n  at: 5\n  links: []\n  respondsTo: t9\n  respondsAs: maybe\n---\n\nx\n";
        expect(parseThought(broken, "lab/t1.md").respondsTo).toBeUndefined();
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

describe("a highlight is a thought with a passage (#671)", () => {
    const quote = {
        exact: 'State is a projection: "history" first, #always',
        prefix: "Event sourcing says: ",
        suffix: ". Then CQRS.",
        heading: "Why: the core idea",
    };

    it("round-trips the passage, colons, quotes and all", () => {
        const thought = newThought({ id: "h1", at: 1, text: "This is the part I keep forgetting.", about: "es.md", quote });
        const back = parseThought(renderThought(thought), "lab/1-h1.md");
        expect(back.quote).toEqual(quote);
        expect(back.text).toBe("This is the part I keep forgetting.");
        expect(back.about).toBe("es.md");
        expect(isHighlight(back)).toBe(true);
    });

    it("keeps a highlight with no margin note — a mark alone", () => {
        const back = parseThought(renderThought(newThought({ id: "h2", at: 2, text: "", about: "es.md", quote })), "x.md");
        expect(back.text).toBe("");
        expect(back.quote?.exact).toBe(quote.exact);
    });

    it("leaves a plain thought exactly as it was: no quote fields", () => {
        const plain = renderThought(newThought({ id: "p", at: 3, text: "Just a thought" }));
        expect(plain).not.toContain("quote");
        expect(isHighlight(parseThought(plain, "p.md"))).toBe(false);
    });

    it("drops an empty passage rather than writing a highlight of nothing", () => {
        const thought = newThought({ id: "e", at: 4, text: "x", about: "es.md", quote: { exact: "", prefix: "", suffix: "" } });
        expect(thought.quote).toBeUndefined();
    });

    it("reads a hand-edited, unquoted passage as it stands", () => {
        const file = "---\nzfThought:\n  id: z\n  at: 5\n  links: []\n  about: es.md\n  quoteExact: plain words\n---\n\nnote\n";
        expect(parseThought(file, "z.md").quote).toEqual({ exact: "plain words", prefix: "", suffix: "" });
    });
});

describe("ink is a thought (#745 E6)", () => {
    const quote = { exact: "interface", prefix: "is that its ", suffix: " is much simpler" };
    const text = newThought({
        text: "",
        id: "ink1",
        at: NOW,
        about: "Books/a.epub",
        quote,
        locator: { at: 3, label: "Ch. 4" },
        ink: { drawing: `${NOW}-ink1.svg`, side: "right", x: 0.125, line: -0.25, em: 16 },
    });
    const page = newThought({ text: "", id: "ink2", at: NOW, about: "Papers/p.pdf", locator: { at: 0, label: "p. 1" }, ink: { drawing: `${NOW}-ink2.svg`, page: { px: 0.1, py: 0.125, pw: 0.2, ph: 0.05 } }, layer: "reading" });

    it("round-trips its place beside the words, and on a page, with its layer", () => {
        expect(parseThought(renderThought(text), "Lab/x.md")).toEqual(text);
        expect(parseThought(renderThought(page), "Lab/y.md")).toEqual(page);
        expect(renderThought(text)).toContain(`  inkDrawing: "${NOW}-ink1.svg"`);
        expect(renderThought(page)).toContain('  inkPage: "0.1 0.125 0.2 0.05"');
    });

    it("is ink, and never a highlight — so it is listed, never counted or reviewed", () => {
        expect(isInk(text)).toBe(true);
        expect(isHighlight(text)).toBe(false);
        expect(isInk(page)).toBe(true);
        const highlight = newThought({ text: "", id: "h", at: NOW, about: "Books/a.epub", quote });
        expect(isHighlight(highlight)).toBe(true);
        expect(isInk(highlight)).toBe(false);
    });

    it("reads a thought written by 3.6 unchanged, and a garbled place as no ink at all", () => {
        const old = ["---", "zfThought:", "  id: old", `  at: ${NOW}`, "  links: []", "  about: Notes/a.md", '  quoteExact: "words"', '  quotePrefix: ""', '  quoteSuffix: ""', "---", "", "a note", ""].join("\n");
        const parsed = parseThought(old, "Lab/old.md");
        expect(parsed.ink).toBeUndefined();
        expect(parsed.layer).toBeUndefined();
        expect(isHighlight(parsed)).toBe(true);
        const garbled = renderThought(text).replace("inkSide: right", "inkSide: up");
        expect(parseThought(garbled, "Lab/x.md").ink).toBeUndefined();
    });
});
