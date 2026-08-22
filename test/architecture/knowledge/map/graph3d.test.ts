import { describe, it, expect } from "@jest/globals";
import { build3DGraph } from "architecture/knowledge/map/graph3d";
import { buildModel, idea } from "../../../actions/knowledge/support/knowledgeFixture";

/**
 * #280 S1 — `build3DGraph` is the pure projection feeding the 3D graph view: nodes = ideas, links =
 * out-edges between existing nodes. Obsidian-free and deterministic so the WebGL view can stay a thin
 * shell over tested data.
 */
describe("build3DGraph (#280 S1)", () => {
    it("returns a node per idea and a link per out-edge", () => {
        const model = buildModel([
            idea("A.md", "seed", [{ to: "B.md" }]),
            idea("B.md", "seed", [{ to: "C.md" }]),
            idea("C.md", "seed", []),
        ]);

        const graph = build3DGraph(model);

        expect(graph.nodes.map((n) => n.id).sort()).toEqual(["A.md", "B.md", "C.md"]);
        expect(graph.links.map((l) => `${l.source}->${l.target}`).sort()).toEqual([
            "A.md->B.md",
            "B.md->C.md",
        ]);
    });

    it("gives each node a display name (basename) and a size (degree)", () => {
        const model = buildModel([idea("Notes/Idea one.md", "seed", [{ to: "Notes/Idea two.md" }]), idea("Notes/Idea two.md", "seed", [])]);

        const graph = build3DGraph(model);
        const one = graph.nodes.find((n) => n.id === "Notes/Idea one.md");

        expect(one?.name).toBe("Idea one");
        expect(one?.val).toBeGreaterThanOrEqual(1);
    });

    it("drops links whose target is not a node (dangling wikilinks)", () => {
        const model = buildModel([idea("A.md", "seed", [{ to: "Ghost.md" }])]);

        const graph = build3DGraph(model);

        expect(graph.nodes.map((n) => n.id)).toEqual(["A.md"]);
        expect(graph.links).toEqual([]);
    });

    it("returns an empty graph for an empty model", () => {
        expect(build3DGraph(buildModel([]))).toEqual({ nodes: [], links: [] });
    });
});
