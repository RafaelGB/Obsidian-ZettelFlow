import { describe, it, expect } from "@jest/globals";
import { deriveOutline } from "architecture/knowledge/projects/deriveOutline";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

// a: anchor (in-sel degree 4) · b: anchor (3) · shared: bridges a & b (assigned to a, strength 2) ·
// m*/n*: leaves · lonely: isolated → Misc. ghost.md is selected but unindexed → ignored.
const model = buildModel([
    idea("book/a.md", "permanent", [{ to: "book/m1.md" }, { to: "book/m2.md" }, { to: "book/m3.md" }, { to: "book/shared.md" }]),
    idea("book/b.md", "permanent", [{ to: "book/n1.md" }, { to: "book/n2.md" }, { to: "book/shared.md" }]),
    idea("book/shared.md", "permanent", [{ to: "book/a.md" }]),
    idea("book/m1.md", "permanent", []),
    idea("book/m2.md", "permanent", []),
    idea("book/m3.md", "permanent", []),
    idea("book/n1.md", "permanent", []),
    idea("book/n2.md", "permanent", []),
    idea("book/lonely.md", "permanent", []),
]);

const selection = [
    "book/a.md", "book/b.md", "book/shared.md",
    "book/m1.md", "book/m2.md", "book/m3.md",
    "book/n1.md", "book/n2.md", "book/lonely.md",
    "book/ghost.md",
];

describe("deriveOutline (#173, FR-3..FR-6/FR-10, AC-1)", () => {
    it("clusters the selection into ordered, titled sections with anchors leading", () => {
        expect(deriveOutline(model, selection, { hubThreshold: 3 })).toEqual({
            sections: [
                { title: "book/a.md", notes: ["book/a.md", "book/shared.md", "book/m1.md", "book/m2.md", "book/m3.md"] },
                { title: "book/b.md", notes: ["book/b.md", "book/n1.md", "book/n2.md"] },
                { title: "Misc", notes: ["book/lonely.md"] },
            ],
        });
    });

    it("links every indexed selected note exactly once, dropping the unindexed one", () => {
        const linked = deriveOutline(model, selection, { hubThreshold: 3 }).sections.flatMap((s) => s.notes);
        expect([...linked].sort()).toEqual([
            "book/a.md", "book/b.md", "book/lonely.md",
            "book/m1.md", "book/m2.md", "book/m3.md",
            "book/n1.md", "book/n2.md", "book/shared.md",
        ]);
        expect(new Set(linked).size).toBe(linked.length);
    });

    it("defaults the hub threshold to 2", () => {
        const small = buildModel([
            idea("x.md", "permanent", [{ to: "c1.md" }, { to: "c2.md" }]),
            idea("c1.md", "permanent", []),
            idea("c2.md", "permanent", []),
        ]);
        expect(deriveOutline(small, ["x.md", "c1.md", "c2.md"])).toEqual({
            sections: [{ title: "x.md", notes: ["x.md", "c1.md", "c2.md"] }],
        });
    });

    it("returns no sections for an empty/indexless selection, deterministically and read-only", () => {
        expect(deriveOutline(model, [])).toEqual({ sections: [] });
        expect(deriveOutline(model, ["book/ghost.md"])).toEqual({ sections: [] });
        const before = model.size();
        expect(deriveOutline(model, selection, { hubThreshold: 3 })).toEqual(deriveOutline(model, selection, { hubThreshold: 3 }));
        expect(model.size()).toBe(before);
    });
});
