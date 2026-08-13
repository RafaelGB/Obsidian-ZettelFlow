import { describe, it, expect } from "@jest/globals";
import { sourceField } from "actions/attachSource/attachSourceLogic";
import { ClaimSourceSchema } from "architecture/knowledge/claims/ClaimSourceSchema";
import { deriveIdea } from "architecture/knowledge/model/Idea";

describe("sourceField (#155, FR-4, D3, AC-1)", () => {
    it("keeps a wikilink source verbatim under the source key", () => {
        expect(sourceField("[[Ref]]")).toEqual({ key: "source", value: "[[Ref]]" });
    });

    it("keeps free-text (URL/DOI/citation) verbatim", () => {
        expect(sourceField("https://doi.org/10.1/x")).toEqual({ key: "source", value: "https://doi.org/10.1/x" });
    });

    it("returns null for an empty or whitespace source", () => {
        expect(sourceField("")).toBeNull();
        expect(sourceField("   ")).toBeNull();
    });

    it("writes a field the model derives into a sourced claim (AC-1 attach leg)", () => {
        const field = sourceField("[[Ref]]");
        expect(field).not.toBeNull();
        const idea = deriveIdea(
            {
                path: "note.md",
                title: "note",
                created: 0,
                modified: 0,
                frontmatter: { [field!.key]: field!.value },
                tags: [],
                outgoingLinks: [],
                inlineFields: [],
                resolvedTargets: { Ref: "refs/Ref.md" },
            },
            { claims: new ClaimSourceSchema() }
        );
        expect(idea.maturitySignals.hasSources).toBe(true);
        expect(idea.claims[0].sources).toContainEqual({ ref: "refs/Ref.md", kind: "link" });
    });
});
