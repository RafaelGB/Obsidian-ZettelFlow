import { describe, it, expect } from "@jest/globals";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { Claim, Idea } from "architecture/knowledge/model/Idea";
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
        // #148: `unsourced` is claim-aware — notes with no claim/source declaration are excluded
        // (this fixture declares none), so it no longer degenerates to "every sourceless note".
        expect(Q.unsourced(model)).toEqual([]);
        const byMaturity = Q.byMaturity(model);
        expect(byMaturity.get("isolated")?.map((i) => i.path)).toEqual(["d.md"]);
        expect(byMaturity.get("sparse")?.map((i) => i.path)).toEqual(["a.md", "b.md", "c.md"]);
    });
});

function ideaWithClaims(path: string, claims: Claim[]): Idea {
    return {
        path,
        title: path,
        created: 0,
        modified: 0,
        state: "permanent",
        relations: [],
        claims,
        maturitySignals: {
            inDegree: 0,
            outDegree: 0,
            degree: 0,
            hasSources: claims.some((c) => c.sources.length > 0),
        },
    };
}

describe("claims & sources queries (#148)", () => {
    function model(): KnowledgeModel {
        const m = new KnowledgeModel();
        m.build([
            ideaWithClaims("n1.md", [
                { text: "c1", sources: [{ ref: "S1.md", kind: "link" }] },
                { text: "c2", sources: [] },
            ]),
            ideaWithClaims("n2.md", [
                { text: "c3", sources: [{ ref: "S1.md", kind: "link" }, { ref: "doi:x", kind: "text" }] },
            ]),
            ideaWithClaims("n3.md", []), // no claims -> not in the accounting
            ideaWithClaims("n4.md", [{ text: "c4", sources: [] }]), // claim, no sources -> unsourced
        ]);
        return m;
    }

    it("unsourced excludes bare notes and counts only claimed-but-sourceless notes (AC-2)", () => {
        expect(Q.unsourced(model()).map((i) => i.path)).toEqual(["n4.md"]);
    });

    it("claimsWithoutSources is claim-granular (AC-5)", () => {
        const out = Q.claimsWithoutSources(model()).map((x) => `${x.idea.path}:${x.claim.text}`);
        expect(out).toEqual(["n1.md:c2", "n4.md:c4"]);
    });

    it("sourcesByReferenceCount counts distinct notes per source, most-referenced first (AC-4)", () => {
        const out = Q.sourcesByReferenceCount(model()).map((x) => `${x.source.ref}:${x.count}`);
        expect(out).toEqual(["S1.md:2", "doi:x:1"]);
    });
});
