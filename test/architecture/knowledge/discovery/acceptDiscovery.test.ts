import { describe, it, expect } from "@jest/globals";
import { semanticRelationField } from "actions/createSemanticRelation/createSemanticRelationLogic";
import { SemanticRelationSchema } from "architecture/knowledge/relations/RelationSchema";
import { findDiscoveries } from "architecture/knowledge/discovery/discoveries";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

describe("accept a discovery (#163, AC-2b)", () => {
    it("builds the expands relation field for the pair", () => {
        expect(semanticRelationField("expands", "B")).toEqual({ key: "expands", value: "[[B]]" });
    });

    it("the written field parses into a typed A→B edge", () => {
        const edges = new SemanticRelationSchema().parse({
            path: "A.md",
            frontmatter: { expands: "[[B]]" },
            inlineFields: [],
            outgoingLinks: [],
            resolvedTargets: { B: "B.md" },
        });
        expect(edges).toEqual([{ type: "expands", from: "A.md", to: "B.md" }]);
    });

    it("excludes the pair from discoveries once the expands edge exists", () => {
        const shared: Parameters<typeof idea>[2] = [{ to: "A.md" }, { to: "B.md" }];
        const withoutEdge = buildModel([
            idea("P.md", "permanent", shared),
            idea("Q.md", "permanent", shared),
            idea("A.md", "permanent", []),
            idea("B.md", "permanent", []),
        ]);
        expect(findDiscoveries(withoutEdge, { limit: 10 }).map((d) => `${d.a}::${d.b}`)).toContain("A.md::B.md");

        const accepted = buildModel([
            idea("P.md", "permanent", shared),
            idea("Q.md", "permanent", shared),
            idea("A.md", "permanent", [{ to: "B.md", type: "expands" }]),
            idea("B.md", "permanent", []),
        ]);
        expect(findDiscoveries(accepted, { limit: 10 }).map((d) => `${d.a}::${d.b}`)).not.toContain("A.md::B.md");
    });
});
