import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { buildKnowledgeMap } from "architecture/knowledge/map/knowledgeMap";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";
import type { Idea } from "architecture/knowledge/model/Idea";

/**
 * **A region is a real piece of the graph** (#513, epic #512).
 *
 * The map used to call a region "a note of degree ≥ 5 plus everything one hop from it". Measured on
 * a real 421-note vault that produced **31 regions covering 27 %** of the notes, with 309 in a
 * leftover bucket — which is why three quarters of the 3D graph was painted the "no group" grey and
 * nobody could tell a region from the background. Lowering the threshold to 3 covered 74 % and
 * produced **250 regions for 421 notes**, which is one region per note with extra steps.
 *
 * The same vault has a structure that needs no parameter at all: 99 connected components, the
 * largest holding 248 notes, four islands, and 82 notes with no link. So the heuristic goes and a
 * connected component takes its place.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

function codeLines(source: string): number {
    let inBlock = false;
    let count = 0;
    for (const raw of source.split("\n")) {
        const line = raw.trim();
        if (inBlock) {
            if (line.includes("*/")) inBlock = false;
            continue;
        }
        if (line.startsWith("/*")) {
            if (!line.includes("*/")) inBlock = true;
            continue;
        }
        if (line === "" || line.startsWith("//")) continue;
        count++;
    }
    return count;
}

/** A chain of `size` notes, linked one way — one component, whatever the direction. */
function chain(prefix: string, size: number): Idea[] {
    return Array.from({ length: size }, (_, n) =>
        idea(`${prefix}-${n}.md`, "permanent", n + 1 < size ? [{ to: `${prefix}-${n + 1}.md` }] : [])
    );
}

describe("a region is a connected component (#513)", () => {
    it("partitions a vault shaped like the reference one", () => {
        // One mass of 248, the four real islands, the small ones, and the dust. The numbers are the
        // measurement that motivated the epic, not an invented fixture.
        const sizes = [248, 18, 14, 12, 9, 7, 5, 4, 4];
        const ideas = sizes.flatMap((size, index) => chain(`c${index}`, size));
        const alone = Array.from({ length: 82 }, (_, n) => idea(`alone-${n}.md`, "permanent", []));
        const map = buildKnowledgeMap(buildModel([...ideas, ...alone]));

        expect(map.clusters).toHaveLength(9);
        expect(map.clusters.map((cluster) => cluster.members.length + 1)).toEqual(sizes);
        expect(map.unclustered).toHaveLength(82);

        // Every note with a link is in exactly one region: coverage is a property of the partition
        // now, not an outcome of a threshold.
        const placed = map.clusters.flatMap((cluster) => [cluster.hub, ...cluster.members]);
        expect(placed).toHaveLength(sizes.reduce((a, b) => a + b, 0));
        expect(new Set(placed).size).toBe(placed.length);
    });

    it("reads the graph undirected — a one-way pair is one region, not two", () => {
        const map = buildKnowledgeMap(buildModel([idea("a.md", "permanent", [{ to: "b.md" }]), idea("b.md", "permanent")]));
        expect(map.clusters).toEqual([{ hub: "a.md", degree: 1, members: ["b.md"] }]);
        expect(map.unclustered).toEqual([]);
    });

    it("names a region after its most connected note, ties by path", () => {
        // `hub` keeps its slot and changes meaning: the note a reader would call the region, rather
        // than the note the region happened to be grown from.
        const map = buildKnowledgeMap(
            buildModel([
                idea("spoke1.md", "permanent", [{ to: "centre.md" }]),
                idea("spoke2.md", "permanent", [{ to: "centre.md" }]),
                idea("centre.md", "permanent", [{ to: "spoke1.md" }]),
            ])
        );
        expect(map.clusters[0].hub).toBe("centre.md");
        expect(map.clusters[0].members).toEqual(["spoke1.md", "spoke2.md"]);
    });

    it("orders regions by size, largest first, then by name", () => {
        const map = buildKnowledgeMap(buildModel([...chain("small", 2), ...chain("big", 5)]));
        expect(map.clusters.map((cluster) => cluster.members.length + 1)).toEqual([5, 2]);
    });
});

describe("alone means alone (#513)", () => {
    it("holds the notes with no link, and nothing else", () => {
        const map = buildKnowledgeMap(buildModel([...chain("c", 3), idea("alone.md", "permanent")]));
        expect(map.unclustered).toEqual(["alone.md"]);
    });

    it("counts a link that leaves the scope as no link at all", () => {
        // `attach()` puts `relation.to` in the adjacency whether or not the target is an idea, so a
        // note linking only to something outside the scope has degree 1 and no neighbour here. It is
        // alone in *this* graph, which is the graph the map describes.
        const model = buildModel([idea("inside.md", "permanent", [{ to: "excluded/elsewhere.md" }])]);
        expect(model.get("inside.md")?.maturitySignals.degree).toBe(1);
        expect(buildKnowledgeMap(model)).toEqual({ clusters: [], unclustered: ["inside.md"] });
    });
});

describe("the map kept its promises (#164, #513)", () => {
    it("is deterministic, read-only, and empty for an empty model", () => {
        const model = buildModel(chain("c", 4));
        expect(buildKnowledgeMap(model)).toEqual(buildKnowledgeMap(model));
        expect(model.size()).toBe(4);
        expect(buildKnowledgeMap(buildModel([]))).toEqual({ clusters: [], unclustered: [] });
    });

    it("takes no options — there is no threshold left to tune", () => {
        expect(buildKnowledgeMap).toHaveLength(1);
        expect(read("src/architecture/knowledge/map/knowledgeMap.ts")).not.toContain("hubThreshold");
        expect(read("src/architecture/api/lib/knowledge/knowledgeApi.ts")).not.toContain("BuildKnowledgeMapOptions");
    });

    it("is smaller than the heuristic it replaced", () => {
        // 63 code lines before. A fact needs less code than a guess, and this epic said so up front.
        const now = codeLines(read("src/architecture/knowledge/map/knowledgeMap.ts"));
        expect({ now, ceiling: 50, over: now > 50 }).toEqual({ now, ceiling: 50, over: false });
    });
});
