import { describe, it, expect } from "@jest/globals";
import { extractEdges, DEFAULT_RELATION_TYPE } from "architecture/knowledge/derive/edges";
import { deriveIdea, IdeaSnapshot } from "architecture/knowledge/model/Idea";

describe("extractEdges", () => {
    it("maps wikilinks to directed default-type edges", () => {
        expect(extractEdges("a.md", ["b.md", "c.md"])).toEqual([
            { type: DEFAULT_RELATION_TYPE, from: "a.md", to: "b.md" },
            { type: DEFAULT_RELATION_TYPE, from: "a.md", to: "c.md" },
        ]);
    });

    it("excludes self-links and de-dupes repeated targets", () => {
        expect(extractEdges("a.md", ["a.md", "b.md", "b.md"])).toEqual([
            { type: DEFAULT_RELATION_TYPE, from: "a.md", to: "b.md" },
        ]);
    });

    it("deriveIdea wires outgoing links into directed relations", () => {
        const snap: IdeaSnapshot = {
            path: "a.md",
            title: "A",
            created: 0,
            modified: 0,
            frontmatter: {},
            tags: [],
            outgoingLinks: ["b.md"],
            inlineFields: [],
        };
        const idea = deriveIdea(snap);
        expect(idea.relations).toEqual([{ type: DEFAULT_RELATION_TYPE, from: "a.md", to: "b.md" }]);
        expect(idea.maturitySignals.outDegree).toBe(1);
    });
});
