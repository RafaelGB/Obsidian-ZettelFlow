import { describe, it, expect } from "@jest/globals";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { Idea } from "architecture/knowledge/model/Idea";
import * as Q from "architecture/knowledge/query/queries";

function idea(
    path: string,
    state: string,
    relations: { to: string; type?: string }[] = [],
    hasSources = false
): Idea {
    const rels = relations.map((r) => ({ type: r.type ?? "link", from: path, to: r.to }));
    return {
        path,
        title: path,
        created: 0,
        modified: 0,
        state,
        relations: rels,
        claims: [],
        maturitySignals: { inDegree: 0, outDegree: rels.length, degree: rels.length, hasSources },
    };
}

function fixture(): KnowledgeModel {
    const model = new KnowledgeModel();
    model.build([
        idea("a.md", "permanent", [{ to: "b.md" }, { to: "c.md", type: "supports" }]),
        idea("b.md", "fleeting", [{ to: "c.md" }]),
        idea("c.md", "permanent", [], true),
        idea("d.md", "fleeting", []),
    ]);
    return model;
}

describe("query surface (AC-3, AC-7, FR-5)", () => {
    it("byState partitions exactly", () => {
        const model = fixture();
        expect(Q.byState(model, "permanent").map((i) => i.path)).toEqual(["a.md", "c.md"]);
        expect(Q.byState(model, "fleeting").map((i) => i.path)).toEqual(["b.md", "d.md"]);
        const partition = Q.statePartition(model);
        const total = [...partition.values()].reduce((n, list) => n + list.length, 0);
        expect(total).toBe(model.size());
    });

    it("edgesByType returns edges of a given type", () => {
        const model = fixture();
        expect(Q.edgesByType(model, "link").map((e) => `${e.from}->${e.to}`)).toEqual([
            "a.md->b.md",
            "b.md->c.md",
        ]);
        expect(Q.edgesByType(model, "supports").map((e) => `${e.from}->${e.to}`)).toEqual([
            "a.md->c.md",
        ]);
    });

    it("resolves both outgoing and incoming relations of a node", () => {
        const model = fixture();
        expect(Q.outgoingRelations(model, "a.md").map((e) => e.to).sort()).toEqual(["b.md", "c.md"]);
        expect(Q.incomingRelations(model, "c.md").map((e) => e.from).sort()).toEqual([
            "a.md",
            "b.md",
        ]);
        expect(Q.incomingRelations(model, "c.md", "link").map((e) => e.from)).toEqual(["b.md"]);
    });

    it("orphans (no incoming) and leaves (no outgoing) follow the spec's FR-5 definitions", () => {
        const model = fixture();
        expect(Q.orphans(model).map((i) => i.path)).toEqual(["a.md", "d.md"]);
        expect(Q.leaves(model).map((i) => i.path)).toEqual(["c.md", "d.md"]);
        // unambiguous primitives agree with the aliases
        expect(Q.notesWithNoIncoming(model).map((i) => i.path)).toEqual(["a.md", "d.md"]);
        expect(Q.notesWithNoOutgoing(model).map((i) => i.path)).toEqual(["c.md", "d.md"]);
    });

    it("hubs, unsourced and byMaturity read the maintained signals", () => {
        const model = fixture();
        expect(Q.hubs(model, 2).map((i) => i.path)).toEqual(["a.md", "b.md", "c.md"]);
        expect(Q.hubs(model, 3)).toEqual([]);
        expect(Q.unsourced(model).map((i) => i.path)).toEqual(["a.md", "b.md", "d.md"]);
        const byMaturity = Q.byMaturity(model);
        expect(byMaturity.get("isolated")?.map((i) => i.path)).toEqual(["d.md"]);
        expect(byMaturity.get("sparse")?.map((i) => i.path)).toEqual(["a.md", "b.md", "c.md"]);
    });
});
