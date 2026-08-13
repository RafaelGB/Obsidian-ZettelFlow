import { describe, it, expect } from "@jest/globals";
import { ClaimSourceSchema } from "architecture/knowledge/claims/ClaimSourceSchema";
import { ClaimParseInput } from "architecture/knowledge/model/schema";

const schema = new ClaimSourceSchema();

function input(partial: Partial<ClaimParseInput>): ClaimParseInput {
    return {
        path: "notes/idea.md",
        frontmatter: {},
        inlineFields: [],
        resolvedTargets: {},
        ...partial,
    };
}

describe("ClaimSourceSchema — hybrid, gated by declaration (AC-1)", () => {
    it("explicit claim fields become claims, each carrying the note-level sources", () => {
        const claims = schema.parse(
            input({
                frontmatter: { claim: ["X is true", "Y follows"], sources: ["[[A]]"] },
                resolvedTargets: { A: "a.md" },
            })
        );
        expect(claims).toEqual([
            { text: "X is true", sources: [{ ref: "a.md", kind: "link" }] },
            { text: "Y follows", sources: [{ ref: "a.md", kind: "link" }] },
        ]);
    });

    it("a sources-only note synthesizes one note-level claim (basename)", () => {
        const claims = schema.parse(
            input({ frontmatter: { sources: ["[[A]]", "url:z"] }, resolvedTargets: { A: "a.md" } })
        );
        expect(claims).toEqual([
            { text: "idea", sources: [{ ref: "a.md", kind: "link" }, { ref: "url:z", kind: "text" }] },
        ]);
    });

    it("a note with neither claim nor source yields no claims", () => {
        expect(schema.parse(input({ frontmatter: { author: "me" } }))).toEqual([]);
    });

    it("dedupes a source declared in both frontmatter and inline", () => {
        const claims = schema.parse(
            input({
                frontmatter: { sources: ["[[A]]"] },
                inlineFields: [{ key: "source", value: "[[A]]" }],
                resolvedTargets: { A: "a.md" },
            })
        );
        expect(claims).toEqual([{ text: "idea", sources: [{ ref: "a.md", kind: "link" }] }]);
    });

    it("an explicit claim with no source is a sourceless claim", () => {
        expect(schema.parse(input({ inlineFields: [{ key: "claim", value: "bare claim" }] }))).toEqual([
            { text: "bare claim", sources: [] },
        ]);
    });
});
