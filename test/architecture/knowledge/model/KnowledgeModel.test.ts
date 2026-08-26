import { describe, it, expect } from "@jest/globals";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { deriveIdea, IdeaSnapshot } from "architecture/knowledge/model/Idea";

function snap(path: string, links: string[] = []): IdeaSnapshot {
    return {
        path,
        title: path,
        created: 0,
        modified: 0,
        frontmatter: {},
        tags: [],
        outgoingLinks: links,
        inlineFields: [],
    };
}

describe("KnowledgeModel — incremental single-entry updates (AC-2)", () => {
    it("build + upsert (create/modify) are visible through the indexes", () => {
        const model = new KnowledgeModel();
        model.build([deriveIdea(snap("a.md", ["b.md"])), deriveIdea(snap("b.md"))]);
        expect(model.get("a.md")?.maturitySignals.outDegree).toBe(1);
        expect(model.inNeighbors("b.md")).toEqual(["a.md"]);
        expect(model.get("b.md")?.maturitySignals.inDegree).toBe(1);

        // modify: a now links b and c
        model.upsert(deriveIdea(snap("a.md", ["b.md", "c.md"])));
        expect(model.outNeighbors("a.md").sort()).toEqual(["b.md", "c.md"]);

        // create c
        model.upsert(deriveIdea(snap("c.md")));
        expect(model.get("c.md")?.maturitySignals.inDegree).toBe(1);
    });

    it("exposes allocation-free adjacency views + O(1) hasEdge (#302)", () => {
        const model = new KnowledgeModel();
        model.build([deriveIdea(snap("a.md", ["b.md", "c.md"])), deriveIdea(snap("b.md")), deriveIdea(snap("c.md"))]);
        expect([...model.outNeighborSet("a.md")].sort()).toEqual(["b.md", "c.md"]);
        expect([...model.inNeighborSet("b.md")]).toEqual(["a.md"]);
        expect(model.hasEdge("a.md", "b.md")).toBe(true);
        expect(model.hasEdge("b.md", "a.md")).toBe(false);
        expect(model.hasEdge("a.md", "missing.md")).toBe(false);
        // The empty view for an unknown node is safe to iterate.
        expect([...model.outNeighborSet("nope.md")]).toEqual([]);
    });

    it("bumps revision on every mutation, not on no-op removes (#302)", () => {
        const model = new KnowledgeModel();
        model.build([deriveIdea(snap("a.md"))]);
        const r0 = model.revision();
        model.upsert(deriveIdea(snap("b.md", ["a.md"])));
        expect(model.revision()).toBeGreaterThan(r0);
        const r1 = model.revision();
        model.remove("missing.md"); // no-op — nothing changed
        expect(model.revision()).toBe(r1);
        model.remove("b.md");
        expect(model.revision()).toBeGreaterThan(r1);
    });

    it("remove drops outgoing edges but tolerates dangling incoming ones (FR-9)", () => {
        const model = new KnowledgeModel();
        model.build([deriveIdea(snap("a.md", ["b.md"])), deriveIdea(snap("b.md", ["a.md"]))]);
        model.remove("b.md");
        expect(model.get("b.md")).toBeUndefined();
        // a still keeps its (now dangling) outgoing edge to the missing b
        expect(model.outNeighbors("a.md")).toEqual(["b.md"]);
        expect(model.get("a.md")?.relations).toEqual([{ type: "link", from: "a.md", to: "b.md" }]);
        // a's incoming edge from b is gone
        expect(model.inNeighbors("a.md")).toEqual([]);
        expect(model.get("a.md")?.maturitySignals.inDegree).toBe(0);
    });

    it("rename re-keys the entry and rewrites every edge referencing the old path", () => {
        const model = new KnowledgeModel();
        model.build([deriveIdea(snap("a.md", ["b.md"])), deriveIdea(snap("b.md"))]);
        model.rename("b.md", "renamed.md");
        expect(model.get("b.md")).toBeUndefined();
        expect(model.get("renamed.md")).toBeDefined();
        expect(model.get("a.md")?.relations).toEqual([
            { type: "link", from: "a.md", to: "renamed.md" },
        ]);
        expect(model.inNeighbors("renamed.md")).toEqual(["a.md"]);
    });

    it("repeated queries never re-derive: idea object identity is stable (AC-8)", () => {
        const model = new KnowledgeModel();
        model.build([deriveIdea(snap("a.md", ["b.md"])), deriveIdea(snap("b.md"))]);
        const first = model.get("a.md");
        for (let i = 0; i < 5; i++) {
            model.all();
            model.outNeighbors("a.md");
            model.inNeighbors("b.md");
        }
        // Same object reference each read -> nothing was re-derived/rebuilt.
        expect(model.get("a.md")).toBe(first);
    });
});
