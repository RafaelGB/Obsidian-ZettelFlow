import { describe, it, expect } from "@jest/globals";
import { classifyHealth, LinkGraph } from "architecture/knowledge/state";

function makeGraph(
    links: Record<string, string[]>,
    allPaths?: string[]
): LinkGraph {
    const resolvedLinks: Record<string, Record<string, number>> = {};
    for (const [src, targets] of Object.entries(links)) {
        resolvedLinks[src] = {};
        for (const t of targets) {
            resolvedLinks[src][t] = 1;
        }
    }
    const markdownPaths = allPaths ?? Object.keys(links);
    return { resolvedLinks, unresolvedLinks: {}, markdownPaths };
}

describe("classifyHealth", () => {
    it("returns empty orphans and deadEnds for a fully connected set", () => {
        // a→b, b→a: both have outgoing and incoming
        const graph = makeGraph({ "a.md": ["b.md"], "b.md": ["a.md"] });
        const result = classifyHealth(graph);
        expect(result.orphans).toHaveLength(0);
        expect(result.deadEnds).toHaveLength(0);
        expect(result.totalScanned).toBe(2);
    });

    it("classifies a note with no outgoing links as an orphan", () => {
        const graph = makeGraph({ "a.md": ["b.md"], "b.md": [] });
        const result = classifyHealth(graph);
        expect(result.orphans.map((n) => n.path)).toContain("b.md");
        expect(result.orphans.map((n) => n.path)).not.toContain("a.md");
    });

    it("classifies a note with no incoming backlinks as a dead-end", () => {
        const graph = makeGraph({ "a.md": ["b.md"], "b.md": ["a.md"] }, ["a.md", "b.md", "c.md"]);
        const result = classifyHealth(graph);
        // c.md has no incoming links (nothing points to it)
        expect(result.deadEnds.map((n) => n.path)).toContain("c.md");
    });

    it("a note can be both an orphan and a dead-end", () => {
        // isolated.md has no outgoing and nothing points to it
        const graph = makeGraph({ "a.md": ["b.md"], "b.md": [] }, ["a.md", "b.md", "isolated.md"]);
        const result = classifyHealth(graph);
        expect(result.orphans.map((n) => n.path)).toContain("isolated.md");
        expect(result.deadEnds.map((n) => n.path)).toContain("isolated.md");
    });

    it("does not count self-links as outgoing", () => {
        // self.md only links to itself — no real outgoing link
        const graph = makeGraph({ "self.md": ["self.md"] });
        const result = classifyHealth(graph);
        expect(result.orphans.map((n) => n.path)).toContain("self.md");
    });

    it("returns correct basename from path", () => {
        const graph = makeGraph({ "folder/note.md": [] });
        const result = classifyHealth(graph);
        expect(result.orphans[0].basename).toBe("note");
    });

    it("reports the total number of notes scanned", () => {
        const graph = makeGraph({ "a.md": [], "b.md": [], "c.md": [] });
        const result = classifyHealth(graph);
        expect(result.totalScanned).toBe(3);
    });

    it("returns a non-negative durationMs", () => {
        const graph = makeGraph({ "a.md": ["b.md"], "b.md": [] });
        const result = classifyHealth(graph);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("handles an empty vault without throwing", () => {
        const graph = makeGraph({});
        const result = classifyHealth(graph);
        expect(result.orphans).toHaveLength(0);
        expect(result.deadEnds).toHaveLength(0);
        expect(result.totalScanned).toBe(0);
    });

    it("excludes notes that are not in markdownPaths from results", () => {
        // Only "a.md" and "b.md" are in scope; "external.md" is a resolved target but not a vault note
        const graph: LinkGraph = {
            resolvedLinks: {
                "a.md": { "external.md": 1 },
                "b.md": {},
            },
            unresolvedLinks: {},
            markdownPaths: ["a.md", "b.md"],
        };
        const result = classifyHealth(graph);
        // external.md not in markdownPaths — should not appear in deadEnds
        expect(result.deadEnds.map((n) => n.path)).not.toContain("external.md");
    });
});
