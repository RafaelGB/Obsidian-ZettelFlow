import { describe, it, expect } from "@jest/globals";
import { build3DGraph } from "architecture/knowledge/map/graph3d";
import { buildScene, communityBounds, indicesOf, neighbourhoodOf } from "architecture/components/core/graph/graphScene";
import { idea, buildModel } from "../../../../actions/knowledge/support/knowledgeFixture";
import type { Idea } from "architecture/knowledge/model/Idea";

function clique(prefix: string, size: number): Idea[] {
    return Array.from({ length: size }, (_, n) =>
        idea(
            `${prefix}-${n}.md`,
            "permanent",
            Array.from({ length: size }, (_, m) => m)
                .filter((m) => m !== n)
                .map((m) => ({ to: `${prefix}-${m}.md` }))
        )
    );
}

/**
 * **The graph as columns** (#693). The renderer and the layout read typed arrays, built once per
 * graph — these tests pin what each column means, because a GPU reading the wrong column draws a
 * plausible picture of the wrong thing.
 */
describe("the scene the GPU draws from (#693)", () => {
    const graph = build3DGraph(buildModel([...clique("big", 5), ...clique("small", 3), idea("alone.md", "seed", [])]));
    const scene = buildScene(graph);

    it("holds every note once, by path", () => {
        expect(scene.n).toBe(9);
        expect(scene.ids).toEqual(graph.nodes.map((node) => node.id));
        for (const [i, id] of scene.ids.entries()) expect(scene.index.get(id)).toBe(i);
    });

    it("ranks communities by size, so the biggest gets the first palette slot", () => {
        expect(scene.communities.map((c) => c.size)).toEqual([5, 3]);
        expect(scene.communities[0].index).toBe(0);
        const big = scene.index.get("big-0.md") as number;
        expect(scene.community[big]).toBe(0);
    });

    it("marks a note that is alone with -1", () => {
        expect(scene.community[scene.index.get("alone.md") as number]).toBe(-1);
    });

    it("names a community after its hub, and keeps the hub's path for a rename (#697)", () => {
        expect(scene.communities[0].hub).toMatch(/^big-\d\.md$/);
        expect(scene.communities[0].name).toBe(scene.communities[0].hub.replace(/\.md$/, ""));
    });

    it("keeps two indices per link, and a symmetric adjacency", () => {
        expect(scene.edges.length).toBe(scene.linkCount * 2);
        const a = scene.index.get("small-0.md") as number;
        const around = neighbourhoodOf(scene, a);
        expect([...around].map((i) => scene.ids[i]).sort()).toEqual(["small-0.md", "small-1.md", "small-2.md"]);
        for (const j of around) if (j !== a) expect(neighbourhoodOf(scene, j).has(a)).toBe(true);
    });

    it("puts the best connected notes first, for the labels", () => {
        const degrees = scene.hubs.map((i) => scene.degree[i]);
        expect([...degrees]).toEqual([...degrees].sort((x, y) => y - x));
    });

    it("turns paths into indices and drops what it does not hold", () => {
        expect(indicesOf(scene, ["big-0.md", "missing.md"]).size).toBe(1);
    });

    it("drops a link whose end is not in the scene", () => {
        const partial = { nodes: graph.nodes.filter((node) => node.id !== "big-4.md"), links: graph.links };
        const filtered = buildScene(partial);
        for (let e = 0; e < filtered.edges.length; e++) expect(filtered.edges[e]).toBeLessThan(filtered.n);
    });
});

describe("where a region sits, for its nebula (#697)", () => {
    it("is the centre of its members, and spreads as far as they do", () => {
        const scene = buildScene(build3DGraph(buildModel(clique("c", 3))));
        const positions = new Float32Array([0, 0, 0, 2, 0, 0, 4, 0, 0]);
        const bounds = communityBounds(scene, positions);
        expect(Array.from(bounds.cx.slice(0, 3))).toEqual([2, 0, 0]);
        expect(bounds.size[0]).toBe(3);
        expect(bounds.spread[0]).toBeCloseTo(Math.sqrt(8 / 3), 5);
    });
});
