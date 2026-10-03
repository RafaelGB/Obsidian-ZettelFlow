import { describe, it, expect } from "@jest/globals";
import { addRelationValue, SemanticRelationSchema } from "architecture/knowledge/relations";

describe("addRelationValue (#641 FR-12, AC-8)", () => {
    it("writes a first edge as a wikilink", () => {
        expect(addRelationValue({}, "example", "Ledger")).toEqual({
            frontmatter: { example: "[[Ledger]]" },
            placement: "frontmatter",
        });
    });

    it("turns one edge into a list, and grows a list", () => {
        expect(addRelationValue({ example: "[[A]]" }, "example", "B").frontmatter.example).toEqual(["[[A]]", "[[B]]"]);
        expect(addRelationValue({ example: ["[[A]]", "[[B]]"] }, "example", "C").frontmatter.example).toEqual([
            "[[A]]",
            "[[B]]",
            "[[C]]",
        ]);
    });

    it("does nothing when the edge is already there", () => {
        const fm = { example: ["[[A]]"] };
        expect(addRelationValue(fm, "example", "A")).toEqual({ frontmatter: fm, placement: "none" });
    });

    it("never touches a plain-text value: it says inline, and leaves the property as it was", () => {
        const fm = { example: "some word" };
        const result = addRelationValue(fm, "example", "Ledger");
        expect(result.placement).toBe("inline");
        expect(result.frontmatter).toBe(fm);
        expect(fm).toEqual({ example: "some word" });
    });

    it("does not mutate its input", () => {
        const fm = { example: "[[A]]" };
        addRelationValue(fm, "example", "B");
        expect(fm).toEqual({ example: "[[A]]" });
    });

    it("writes what the relation schema reads back as a typed example edge", () => {
        const { frontmatter } = addRelationValue({}, "example", "Ledger");
        const edges = new SemanticRelationSchema().parse({
            path: "a.md",
            frontmatter,
            outgoingLinks: [],
            inlineFields: [],
            resolvedTargets: { Ledger: "Ledger.md" },
        });
        expect(edges.some((edge) => edge.type === "example")).toBe(true);
    });
});
