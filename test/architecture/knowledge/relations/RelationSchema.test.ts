import { describe, it, expect } from "@jest/globals";
import { SemanticRelationSchema } from "architecture/knowledge/relations/RelationSchema";
import type { RelationParseInput } from "architecture/knowledge/model/schema";

const schema = new SemanticRelationSchema();

function input(partial: Partial<RelationParseInput> & { path: string }): RelationParseInput {
    return {
        frontmatter: {},
        inlineFields: [],
        outgoingLinks: [],
        resolvedTargets: {},
        ...partial,
    };
}

describe("SemanticRelationSchema.parse", () => {
    it("turns a frontmatter typed relation into a resolved directed edge (AC-1)", () => {
        const edges = schema.parse(
            input({
                path: "a.md",
                frontmatter: { contradicts: ["[[B]]"] },
                resolvedTargets: { B: "b.md" },
            })
        );
        expect(edges).toEqual([{ type: "contradicts", from: "a.md", to: "b.md" }]);
    });

    it("turns an inline typed relation into an edge (AC-2 unit)", () => {
        const edges = schema.parse(
            input({
                path: "a.md",
                inlineFields: [{ key: "supports", value: "[[C]]" }],
                resolvedTargets: { C: "c.md" },
            })
        );
        expect(edges).toEqual([{ type: "supports", from: "a.md", to: "c.md" }]);
    });

    it("keeps a typed target from also becoming a link edge, and dedupes (AC-4/FR-7)", () => {
        const edges = schema.parse(
            input({
                path: "a.md",
                frontmatter: { supports: ["[[B]]", "[[B]]"] }, // duplicate
                outgoingLinks: ["b.md"], // same target as a plain link
                resolvedTargets: { B: "b.md" },
            })
        );
        expect(edges).toEqual([{ type: "supports", from: "a.md", to: "b.md" }]);
    });

    it("ignores an unknown relation key (AC-5/FR-12)", () => {
        const edges = schema.parse(
            input({
                path: "a.md",
                frontmatter: { foobar: ["[[B]]"] },
                resolvedTargets: { B: "b.md" },
            })
        );
        expect(edges).toEqual([]);
    });

    it("excludes an unresolved target and does not throw (AC-9/FR-5)", () => {
        expect(() =>
            schema.parse(input({ path: "a.md", frontmatter: { supports: ["[[Ghost]]"] } }))
        ).not.toThrow();
        expect(schema.parse(input({ path: "a.md", frontmatter: { supports: ["[[Ghost]]"] } }))).toEqual([]);
    });

    it("keeps untyped outgoing links as plain link edges (AC-3/FR-8)", () => {
        const edges = schema.parse(input({ path: "a.md", outgoingLinks: ["d.md"] }));
        expect(edges).toEqual([{ type: "link", from: "a.md", to: "d.md" }]);
    });
});
