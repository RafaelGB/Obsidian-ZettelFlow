import { describe, it, expect } from "@jest/globals";
import { findDiscoveries } from "architecture/knowledge/discovery/discoveries";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

// P,Q co-cite A/B/C; X,Y couple via T. A→B is a direct link, and P/Q→A make A-P/A-Q linked pairs.
const model = buildModel([
    idea("P.md", "permanent", [{ to: "A.md" }, { to: "B.md" }, { to: "C.md" }]),
    idea("Q.md", "permanent", [{ to: "A.md" }, { to: "B.md" }]),
    idea("A.md", "permanent", [{ to: "B.md" }]),
    idea("B.md", "permanent", []),
    idea("C.md", "permanent", []),
    idea("X.md", "permanent", [{ to: "T.md" }]),
    idea("Y.md", "permanent", [{ to: "T.md" }]),
    idea("T.md", "permanent", []),
]);

describe("findDiscoveries (#163, AC-1, AC-2a)", () => {
    it("ranks unlinked shared-context pairs, score desc then a/b asc", () => {
        expect(findDiscoveries(model, { limit: 10 })).toEqual([
            { a: "A.md", b: "C.md", score: 2 },
            { a: "B.md", b: "C.md", score: 2 },
            { a: "P.md", b: "Q.md", score: 2 },
            { a: "X.md", b: "Y.md", score: 1 },
        ]);
    });

    it("excludes already-linked pairs, even high-scoring ones (AC-1)", () => {
        const pairs = findDiscoveries(model, { limit: 10 }).map((d) => `${d.a}::${d.b}`);
        expect(pairs).not.toContain("A.md::B.md"); // A→B direct link, co-citation 2
        expect(pairs).not.toContain("A.md::P.md"); // P→A
        expect(pairs).not.toContain("A.md::Q.md"); // Q→A
    });

    it("caps to the limit (default 3)", () => {
        expect(findDiscoveries(model)).toHaveLength(3);
        expect(findDiscoveries(model).map((d) => `${d.a}::${d.b}`)).toEqual([
            "A.md::C.md",
            "B.md::C.md",
            "P.md::Q.md",
        ]);
    });

    it("is deterministic and returns [] for an empty or edgeless model", () => {
        expect(findDiscoveries(model, { limit: 10 })).toEqual(findDiscoveries(model, { limit: 10 }));
        expect(findDiscoveries(buildModel([]))).toEqual([]);
        expect(
            findDiscoveries(buildModel([idea("a.md", "permanent"), idea("b.md", "permanent")]))
        ).toEqual([]);
    });
});
