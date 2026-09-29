import { describe, it, expect } from "@jest/globals";
import { parseTags } from "application/thinking/tags";
import { newThought, parseThought, renderThought } from "application/thinking/thought";

describe("parseTags — inline hashtags from a thought body (#596, AC-7)", () => {
    it("pulls the hashtags, # stripped, order preserved, de-duplicated", () => {
        expect(parseTags("an #idea and a #reto and another #idea")).toEqual(["idea", "reto"]);
    });

    it("de-duplicates case-insensitively, keeping the first casing", () => {
        expect(parseTags("#Idea then #idea")).toEqual(["Idea"]);
    });

    it("needs a boundary before #, so a URL fragment or a glued word is not a tag", () => {
        expect(parseTags("see https://example.com/p#section")).toEqual([]);
        expect(parseTags("word#notatag")).toEqual([]);
    });

    it("does not read a # inside an inline-code span", () => {
        expect(parseTags("the literal `#ffffff` colour, but #design counts")).toEqual(["design"]);
    });

    it("stops at punctuation boundaries", () => {
        expect(parseTags("done. #idea, #reto! end")).toEqual(["idea", "reto"]);
    });

    it("is empty for a plain body", () => {
        expect(parseTags("no tags here")).toEqual([]);
    });
});

describe("a body with #tags round-trips untouched (#596)", () => {
    it("survives renderThought(parseThought(...)) byte-identical, with no tag key in frontmatter", () => {
        const thought = newThought({ text: "a note about #design and #speed", id: "t1", at: 1 });
        const rendered = renderThought(thought);
        const reparsed = renderThought(parseThought(rendered, "lab/t1.md"));
        expect(reparsed).toBe(rendered);
        // Tags live in the body, never a frontmatter key — nothing to migrate, nothing to leak.
        expect(rendered).not.toMatch(/^\s*tags?:/m);
        expect(parseTags(thought.text)).toEqual(["design", "speed"]);
    });
});
