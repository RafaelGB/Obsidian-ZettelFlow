import { describe, it, expect } from "@jest/globals";
import { resolveCrystallizeTokens, substituteContextTokens } from "application/notes/contextTokens";
import type { CrystallizeSeed } from "application/thinking/crystallize";

describe("substituteContextTokens", () => {
    it("replaces {{frontmatter.KEY}} with the frontmatter value", () => {
        expect(
            substituteContextTokens("Written by {{frontmatter.author}}.", { author: "Ada Lovelace" }, "Canvas")
        ).toBe("Written by Ada Lovelace.");
    });

    it("replaces missing key with empty string", () => {
        expect(
            substituteContextTokens("Type: {{frontmatter.nonexistent}}.", {}, "Canvas")
        ).toBe("Type: .");
    });

    it("replaces null frontmatter value with empty string", () => {
        expect(
            substituteContextTokens("{{frontmatter.status}}", { status: null }, "Canvas")
        ).toBe("");
    });

    it("replaces {{canvas.name}} with canvas basename", () => {
        expect(
            substituteContextTokens("Canvas: {{canvas.name}}.", {}, "MyCanvas")
        ).toBe("Canvas: MyCanvas.");
    });

    it("replaces multiple tokens in one pass", () => {
        expect(
            substituteContextTokens("{{frontmatter.author}} in {{canvas.name}}", { author: "Ada" }, "Tasks")
        ).toBe("Ada in Tasks");
    });

    it("leaves unrelated {{title}} tokens unchanged", () => {
        expect(
            substituteContextTokens("{{title}} is unchanged", {}, "")
        ).toBe("{{title}} is unchanged");
    });

    it("handles keys with hyphens and underscores", () => {
        expect(
            substituteContextTokens("{{frontmatter.my-key}} {{frontmatter.my_key}}", { "my-key": "A", "my_key": "B" }, "")
        ).toBe("A B");
    });

    it("replaces all occurrences of the same token", () => {
        expect(
            substituteContextTokens("{{frontmatter.x}} and {{frontmatter.x}}", { x: "Y" }, "")
        ).toBe("Y and Y");
    });
});

describe("resolveCrystallizeTokens — the crystallized text, once, on top unless a step places it (#712)", () => {
    const seed: CrystallizeSeed = {
        title: "Replay is the model",
        content: "My idea.\n\n## Born from\n- \"my idea\"\n",
        quote: "Replay rebuilds it.",
        source: "[[Notes/Event sourcing#Events]]",
        frozen: 1,
    };

    it("puts the content above the template's body when no step places it", () => {
        expect(resolveCrystallizeTokens("Template body.\n", seed)).toBe(`${seed.content}\nTemplate body.\n`);
        expect(resolveCrystallizeTokens("", seed)).toBe(seed.content);
    });

    it("puts it where {{crystallize.content}} is, exactly once, and not on top", () => {
        const once = resolveCrystallizeTokens("# Head\n{{crystallize.content}}\nFoot\n", seed);
        expect(once).toBe(`# Head\n${seed.content}\nFoot\n`);
        const twice = resolveCrystallizeTokens("{{crystallize.content}}|{{crystallize.content}}", seed);
        expect(twice.split("My idea.").length - 1).toBe(1);
        expect(twice.endsWith("|")).toBe(true);
    });

    it("resolves the title, the quote and the source", () => {
        expect(resolveCrystallizeTokens("{{crystallize.title}} · {{crystallize.quote}} · {{crystallize.source}}{{crystallize.content}}", seed)).toBe(
            `Replay is the model · Replay rebuilds it. · [[Notes/Event sourcing#Events]]${seed.content}`
        );
    });

    it("in any other flow, the four become empty text and nothing else moves", () => {
        expect(resolveCrystallizeTokens("a{{crystallize.content}}b{{crystallize.title}}c{{crystallize.quote}}{{crystallize.source}} {{title}} {{x}}", undefined)).toBe(
            "abc {{title}} {{x}}"
        );
    });
});
