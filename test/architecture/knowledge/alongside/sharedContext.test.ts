import { describe, it, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import type { Idea } from "architecture/knowledge/model/Idea";
import { sharedContext } from "architecture/knowledge/alongside/sharedContext";
import { pairScore } from "architecture/knowledge/discovery/discoveries";

function note(path: string, links: string[] = []): Idea {
    return {
        path,
        title: path.replace(/\.md$/, ""),
        created: 0,
        modified: 0,
        state: "permanent",
        relations: links.map((to) => ({ type: "link", from: path, to })),
        claims: [],
        maturitySignals: { inDegree: 0, outDegree: links.length, degree: links.length, hasSources: false },
    };
}

/**
 * `a` and `b` are both cited by `s1` and `s2` (co-citation 2) and unlinked; `c` is cited with `a`
 * by `s1` only (co-citation 1) and both point to `t` (coupling 1); `linked` is cited with `a` but
 * linked to it.
 */
function vault(): KnowledgeModel {
    const model = new KnowledgeModel();
    model.build([
        note("a.md", ["t.md"]),
        note("b.md"),
        note("c.md", ["t.md"]),
        note("t.md"),
        note("linked.md", ["a.md"]),
        note("s1.md", ["a.md", "b.md", "c.md", "linked.md"]),
        note("s2.md", ["a.md", "b.md"]),
    ]);
    return model;
}

describe("shared context: unlinked notes beside a near one (#754 FR-5 Connections)", () => {
    it("finds the unlinked notes that share neighbours, ranked by discovery's own score", () => {
        const found = sharedContext(vault(), "a.md", 5);
        expect(found).toEqual([
            { path: "b.md", score: pairScore(2, 0) },
            { path: "c.md", score: pairScore(1, 1) },
        ]);
    });

    it("leaves out a linked pair and a pair you ruled out", () => {
        const model = vault();
        expect(sharedContext(model, "a.md", 5).map((row) => row.path)).not.toContain("linked.md");
        const ruled = sharedContext(model, "a.md", 5, (x, y) => (x === "a.md" && y === "b.md") || (x === "b.md" && y === "a.md"));
        expect(ruled.map((row) => row.path)).toEqual(["c.md"]);
    });

    it("keeps to the limit, and to an unknown note's nothing", () => {
        expect(sharedContext(vault(), "a.md", 1).map((row) => row.path)).toEqual(["b.md"]);
        expect(sharedContext(vault(), "missing.md", 3)).toEqual([]);
    });

    it("is degree-bounded: it never builds the vault-wide gap tally", () => {
        const source = readFileSync(join(__dirname, "..", "..", "..", "..", "src", "architecture", "knowledge", "alongside", "sharedContext.ts"), "utf8");
        expect(source).not.toMatch(/gapTally|findDiscoveries|topGaps/);
        const model = vault();
        const all = jest.spyOn(model, "all");
        sharedContext(model, "a.md", 3);
        expect(all).not.toHaveBeenCalled();
    });
});
