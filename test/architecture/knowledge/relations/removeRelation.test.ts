import { describe, it, expect } from "@jest/globals";
import { removeRelationField, listRelationEdges } from "architecture/knowledge/relations/removeRelation";

describe("removeRelationField (#181, pure core)", () => {
    it("removes a scalar edge and deletes the now-empty key", () => {
        const fm = { supports: "[[Alpha]]", title: "T" };
        const result = removeRelationField(fm, "supports", "Alpha");
        expect(result.changed).toBe(true);
        expect(result.frontmatter).toEqual({ title: "T" });
        // input is not mutated
        expect(fm).toEqual({ supports: "[[Alpha]]", title: "T" });
    });

    it("removes one value from a list and keeps the rest", () => {
        const fm = { contradicts: ["[[Alpha]]", "[[Beta]]"] };
        const result = removeRelationField(fm, "contradicts", "Beta");
        expect(result.changed).toBe(true);
        expect(result.frontmatter).toEqual({ contradicts: ["[[Alpha]]"] });
    });

    it("deletes the key when the last list value is removed", () => {
        const result = removeRelationField({ expands: ["[[Only]]"] }, "expands", "Only");
        expect(result.changed).toBe(true);
        expect(result.frontmatter).toEqual({});
    });

    it("matches wikilink-normalized (alias / heading / bare name)", () => {
        expect(removeRelationField({ supports: "[[Alpha|the A]]" }, "supports", "Alpha").changed).toBe(true);
        expect(removeRelationField({ supports: "[[Alpha#intro]]" }, "supports", "[[Alpha]]").changed).toBe(true);
        expect(removeRelationField({ supports: "[[Alpha]]" }, "supports", "alpha").changed).toBe(false); // case-sensitive names
    });

    it("is a no-op (changed:false, untouched) for a missing key, missing value, or empty target", () => {
        expect(removeRelationField({ supports: "[[Alpha]]" }, "contradicts", "Alpha")).toEqual({
            frontmatter: { supports: "[[Alpha]]" },
            changed: false,
        });
        expect(removeRelationField({ supports: "[[Alpha]]" }, "supports", "Gamma").changed).toBe(false);
        expect(removeRelationField({ supports: "[[Alpha]]" }, "supports", "").changed).toBe(false);
    });
});

describe("listRelationEdges (#181)", () => {
    it("lists every typed-relation edge in a frontmatter object", () => {
        const fm = {
            title: "T",
            supports: "[[Alpha]]",
            contradicts: ["[[Beta]]", "[[Gamma]]"],
            unrelatedKey: "[[NotARelation]]",
        };
        expect(listRelationEdges(fm)).toEqual([
            { relationType: "supports", target: "Alpha" },
            { relationType: "contradicts", target: "Beta" },
            { relationType: "contradicts", target: "Gamma" },
        ]);
    });

    it("returns [] when there are no typed relations", () => {
        expect(listRelationEdges({ title: "T", tags: ["x"] })).toEqual([]);
        expect(listRelationEdges(undefined)).toEqual([]);
    });

    it("ignores a plain-string value under a relation-type key (question/example are also words)", () => {
        // `question` and `example` are relation types AND ordinary frontmatter values; only wikilinks are edges.
        expect(listRelationEdges({ question: "What is X?", example: "see the intro" })).toEqual([]);
        expect(listRelationEdges({ supports: "[[Real]]", question: "not an edge" })).toEqual([
            { relationType: "supports", target: "Real" },
        ]);
    });
});

describe("removeRelationField ignores non-wikilink values (#181 review)", () => {
    it("never removes a plain-string value under a relation-type key", () => {
        expect(removeRelationField({ question: "What is X?" }, "question", "What is X?")).toEqual({
            frontmatter: { question: "What is X?" },
            changed: false,
        });
    });
});
