import { describe, it, expect } from "@jest/globals";
import { deriveIdea, DEFAULT_STATE, Idea, IdeaSnapshot } from "architecture/knowledge/model/Idea";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { ClaimSchema, RelationSchema, StateSchema } from "architecture/knowledge/model/schema";
import * as Q from "architecture/knowledge/query/queries";

const stateSchema: StateSchema = {
    property: "state",
    all: ["fleeting", "permanent"],
    parse: (fm) => (typeof fm.state === "string" ? (fm.state as string) : DEFAULT_STATE),
};

const relationSchema: RelationSchema = {
    types: ["supports", "contradicts", "link"],
    parse: ({ path, inlineFields }) =>
        inlineFields
            .filter((f) => f.key === "supports" || f.key === "contradicts")
            .map((f) => ({ type: f.key, from: path, to: f.value })),
};

const claimSchema: ClaimSchema = {
    parse: ({ inlineFields }) =>
        inlineFields.filter((f) => f.key === "claim").map((f) => ({ text: f.value, sources: [] })),
};

// Compile-time assertion: registering schemas does not change the Idea shape or query signatures.
const _shapeIsStable: (model: KnowledgeModel, state: string) => Idea[] = Q.byState;
void _shapeIsStable;

function snap(path: string, fm: Record<string, unknown>, inline: { key: string; value: string }[]): IdeaSnapshot {
    return {
        path,
        title: path,
        created: 0,
        modified: 0,
        frontmatter: fm,
        tags: [],
        outgoingLinks: [],
        inlineFields: inline,
    };
}

describe("extension points (AC-5, FR-6)", () => {
    it("registered schemas make their attributes queryable through the existing surface", () => {
        const idea = deriveIdea(
            snap("a.md", { state: "permanent" }, [
                { key: "supports", value: "b.md" },
                { key: "claim", value: "X is true" },
            ]),
            { state: stateSchema, relations: relationSchema, claims: claimSchema }
        );
        expect(idea.state).toBe("permanent");
        expect(idea.relations).toEqual([{ type: "supports", from: "a.md", to: "b.md" }]);
        expect(idea.claims).toEqual([{ text: "X is true", sources: [] }]);

        const model = new KnowledgeModel();
        model.build([idea, deriveIdea(snap("b.md", { state: "fleeting" }, []), { state: stateSchema })]);
        expect(Q.byState(model, "permanent").map((i) => i.path)).toEqual(["a.md"]);
        expect(Q.edgesByType(model, "supports").map((e) => `${e.from}->${e.to}`)).toEqual([
            "a.md->b.md",
        ]);
    });

    it("falls back to documented defaults when no schema is registered", () => {
        const idea = deriveIdea(snap("a.md", { state: "permanent" }, [{ key: "supports", value: "b.md" }]));
        // no state schema -> default (frontmatter ignored); no relation schema -> plain link edges only
        expect(idea.state).toBe(DEFAULT_STATE);
        expect(idea.relations).toEqual([]);
        expect(idea.claims).toEqual([]);
    });
});
