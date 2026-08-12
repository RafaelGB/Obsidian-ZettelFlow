import { describe, it, expect } from "@jest/globals";
import { semanticRelationField } from "actions/createSemanticRelation/createSemanticRelationLogic";
import { SemanticRelationSchema } from "architecture/knowledge/relations/RelationSchema";

describe("semanticRelationField (#154, FR-4, AC-2)", () => {
    it("builds a typed frontmatter field for a valid vocabulary type", () => {
        expect(semanticRelationField("supports", "Target")).toEqual({
            key: "supports",
            value: "[[Target]]",
        });
    });

    it("strips a trailing .md so the wikilink is extensionless", () => {
        expect(semanticRelationField("contradicts", "Some Note.md")).toEqual({
            key: "contradicts",
            value: "[[Some Note]]",
        });
    });

    it("returns null for a type outside the #147 semantic vocabulary", () => {
        expect(semanticRelationField("link", "Target")).toBeNull();
        expect(semanticRelationField("made-up", "Target")).toBeNull();
    });

    it("returns null for an empty or whitespace target", () => {
        expect(semanticRelationField("supports", "")).toBeNull();
        expect(semanticRelationField("supports", "   ")).toBeNull();
    });

    it("writes a field the model indexes as exactly one typed edge (AC-2)", () => {
        const field = semanticRelationField("supports", "Target");
        expect(field).not.toBeNull();
        const edges = new SemanticRelationSchema().parse({
            path: "note.md",
            frontmatter: { [field!.key]: field!.value },
            inlineFields: [],
            outgoingLinks: [],
            resolvedTargets: { Target: "target.md" },
        });
        expect(edges).toEqual([{ type: "supports", from: "note.md", to: "target.md" }]);
    });

    it("writes nothing indexable for the null cases", () => {
        expect(semanticRelationField("link", "Target")).toBeNull();
        expect(semanticRelationField("supports", "")).toBeNull();
    });
});
