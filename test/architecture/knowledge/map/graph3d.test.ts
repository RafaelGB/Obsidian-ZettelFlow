import { describe, it, expect } from "@jest/globals";
import {
    build3DGraph,
    capGraph3D,
    filterGraph3D,
    OVERLAY_KINDS,
    OVERLAY_SPECS,
    type Graph3DData,
    type Graph3DNode,
} from "architecture/knowledge/map/graph3d";
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

    it("carries each node's state and a cluster group (-1 when it orbits no hub)", () => {
        const model = buildModel([idea("A.md", "permanent", [{ to: "B.md" }]), idea("B.md", "seed", [])]);
        const graph = build3DGraph(model);
        const a = graph.nodes.find((n) => n.id === "A.md");
        expect(a?.state).toBe("permanent");
        expect(a?.group).toBe(-1); // no hub in a 2-note graph
    });

    it("preserves each link's relation type (plain link vs typed relation)", () => {
        const model = buildModel([
            idea("A.md", "seed", [{ to: "B.md", type: "supports" }, { to: "C.md" }]),
            idea("B.md", "seed", []),
            idea("C.md", "seed", []),
        ]);
        const graph = build3DGraph(model);
        const byPair = Object.fromEntries(graph.links.map((l) => [`${l.source}->${l.target}`, l.type]));
        expect(byPair["A.md->B.md"]).toBe("supports");
        expect(byPair["A.md->C.md"]).toBe("link");
    });
});

describe("filterGraph3D (#280 S3)", () => {
    const data: Graph3DData = {
        nodes: [
            { id: "Zettel/Alpha.md", name: "Alpha", val: 1, group: 0, state: "seed" },
            { id: "Zettel/Beta.md", name: "Beta", val: 1, group: 0, state: "permanent" },
            { id: "Refs/Gamma.md", name: "Gamma", val: 1, group: -1, state: "seed" },
        ],
        links: [
            { source: "Zettel/Alpha.md", target: "Zettel/Beta.md", type: "link" },
            { source: "Zettel/Beta.md", target: "Refs/Gamma.md", type: "supports" },
        ],
    };

    it("matches everything for an empty filter", () => {
        expect(filterGraph3D(data, {})).toEqual(data);
    });

    it("filters by name query and drops links to removed nodes", () => {
        const out = filterGraph3D(data, { query: "et" }); // Beta only ("et" not in Alpha/Gamma... Alpha has no 'et')
        expect(out.nodes.map((n) => n.name).sort()).toEqual(["Beta"]);
        expect(out.links).toEqual([]); // both links touch a removed node
    });

    it("filters by state", () => {
        const out = filterGraph3D(data, { state: "seed" });
        expect(out.nodes.map((n) => n.name).sort()).toEqual(["Alpha", "Gamma"]);
    });

    it("filters by folder prefix", () => {
        const out = filterGraph3D(data, { folder: "Zettel/" });
        expect(out.nodes.map((n) => n.name).sort()).toEqual(["Alpha", "Beta"]);
        expect(out.links.map((l) => l.type)).toEqual(["link"]); // Alpha->Beta survives; Beta->Gamma dropped
    });

    it("does not mutate the input", () => {
        const before = JSON.stringify(data);
        filterGraph3D(data, { state: "seed" });
        expect(JSON.stringify(data)).toBe(before);
    });
});

describe("discovery-lens flags & overlays (#280 S4)", () => {
    it("flags orphans (no out-edges), dead-ends (no in-edges) and contradictions", () => {
        const model = buildModel([
            idea("A.md", "seed", [{ to: "B.md", type: "contradicts" }]), // A: has out (not orphan), no in (dead-end), contradiction
            idea("B.md", "seed", [{ to: "C.md" }]),                        // B: out+in, contradiction (target of A)
            idea("C.md", "seed", []),                                      // C: in, no out → orphan
        ]);
        const byId = Object.fromEntries(build3DGraph(model).nodes.map((n) => [n.id, n]));

        expect(byId["C.md"].orphan).toBe(true);
        expect(byId["A.md"].orphan).toBe(false);
        expect(byId["A.md"].deadEnd).toBe(true);
        expect(byId["C.md"].deadEnd).toBe(false);
        expect(byId["A.md"].contradiction).toBe(true);
        expect(byId["B.md"].contradiction).toBe(true);
        expect(byId["C.md"].contradiction).toBe(false);
    });

    it("every overlay kind has a spec with a label, colour var and a working predicate", () => {
        for (const kind of OVERLAY_KINDS) {
            const spec = OVERLAY_SPECS[kind];
            expect(typeof spec.labelKey).toBe("string");
            expect(spec.colorVar.startsWith("--")).toBe(true);
            expect(typeof spec.matches).toBe("function");
        }
        const model = buildModel([idea("Solo.md", "seed", [])]); // orphan + dead-end
        const node = build3DGraph(model).nodes[0];
        expect(OVERLAY_SPECS.orphans.matches(node)).toBe(true);
        expect(OVERLAY_SPECS.contradictions.matches(node)).toBe(false);
    });
});

describe("capGraph3D (#280 S5)", () => {
    const node = (id: string, val: number): Graph3DNode => ({
        id, name: id, val, group: -1, state: "seed", orphan: false, deadEnd: false, contradiction: false,
    });
    const data: Graph3DData = {
        nodes: [node("A", 3), node("B", 2), node("C", 1)],
        links: [{ source: "A", target: "C", type: "link" }],
    };

    it("returns the graph unchanged when it fits under the cap", () => {
        expect(capGraph3D(data, 10)).toEqual(data);
    });

    it("keeps the most-connected nodes and prunes links to dropped nodes", () => {
        const out = capGraph3D(data, 2);
        expect(out.nodes.map((n) => n.id).sort()).toEqual(["A", "B"]); // C (lowest val) dropped
        expect(out.links).toEqual([]); // A->C pruned
    });
});
