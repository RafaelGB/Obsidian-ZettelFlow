import { describe, it, expect } from "@jest/globals";
import { ContentDTO } from "application/notes/model/ContentDTO";

describe("ContentDTO (#317 S4 — note-builder core)", () => {
    it("accumulates content and replaces every {{token}} occurrence", () => {
        const dto = new ContentDTO();
        dto.add("# {{title}}\n\nAbout {{title}}.");
        dto.modify("title", "Memory");
        expect(dto.get()).toBe("# Memory\n\nAbout Memory.");
        expect(dto.getModifications()).toEqual({ title: "Memory" });
    });

    it("merges frontmatter and lifts tags out into the tag list (deduped)", () => {
        const dto = new ContentDTO();
        dto.addFrontMatter({ state: "fleeting", tags: ["a", "b"] });
        dto.addFrontMatter({ source: "x", tags: "b" }); // "b" already present, string form
        expect(dto.getFrontmatter()).toEqual({ state: "fleeting", source: "x" }); // tags removed from fm
        expect(dto.getTags()).toEqual(["a", "b"]);
        expect(dto.hasTags()).toBe(true);
    });

    it("documents the token-injection surface that AI-output sanitisation guards (#301)", () => {
        // modify() is a raw global replace, so a value that itself contains a later token WILL be
        // re-substituted by that later modify(). This is exactly why AI output is neutralised
        // (`sanitizeAiText`, tested in aiGuardrails) BEFORE it can reach a `{{token}}` — a completion
        // can never inject a live token here.
        const dto = new ContentDTO();
        dto.add("{{a}} {{b}}");
        dto.modify("a", "{{b}}"); // a hostile, unsanitised value → content becomes "{{b}} {{b}}"
        dto.modify("b", "SAFE"); // both — the injected AND the original — get replaced
        expect(dto.get()).toBe("SAFE SAFE");
    });

    it("reset clears content, frontmatter, tags and modifications", () => {
        const dto = new ContentDTO();
        dto.add("x").addFrontMatter({ a: 1 });
        dto.addTag("t");
        dto.modify("k", "v");
        dto.reset();
        expect(dto.get()).toBe("");
        expect(dto.getFrontmatter()).toEqual({});
        expect(dto.getTags()).toEqual([]);
        expect(dto.getModifications()).toEqual({});
    });
});
