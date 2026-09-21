import { describe, it, expect } from "@jest/globals";
import { communitiesOf } from "architecture/knowledge/map/communities";
import { buildKnowledgeMap } from "architecture/knowledge/map/knowledgeMap";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";
import type { Idea } from "architecture/knowledge/model/Idea";

/**
 * **The neighbourhoods, measured** (#524, epic #522).
 *
 * A region is a connected component (#513) — it says what is cut off from what, and on the
 * reference vault one region holds 59 % of the notes. Inside that mass it says nothing.
 *
 * Epic #512 claimed there was nothing finer to find. That rested on **label propagation**, which
 * put 244 of 248 notes into one community — a known failure mode of that algorithm on sparse,
 * hub-heavy graphs, and not evidence about the graph. **Louvain** on the same component finds
 * **17 communities**, sizes 36…9, all of them ≥ 5, the largest only 13 % of the component.
 *
 * Louvain runs **per region** here. Modularity would never merge across components anyway, so
 * that is not about the partition being right: it makes "a community never straddles a region"
 * true by construction, and it hands each community its region for free.
 */

/** A clique of `size` notes, every one linked to every other — a planted community. */
function clique(prefix: string, size: number): Idea[] {
    return Array.from({ length: size }, (_, n) =>
        idea(
            `${prefix}-${n}.md`,
            "permanent",
            Array.from({ length: size }, (_, m) => m)
                .filter((m) => m > n)
                .map((m) => ({ to: `${prefix}-${m}.md` }))
        )
    );
}

/** One extra edge from the first note of `a` to the first note of `b`. */
function joined(a: string, b: string): Idea {
    return idea(`join-${a}-${b}.md`, "permanent", [{ to: `${a}-0.md` }, { to: `${b}-0.md` }]);
}

describe("Louvain finds the neighbourhoods (#524)", () => {
    it("recovers planted structure the region cannot see", () => {
        // Four dense groups, joined into a single connected component by three thin links. As one
        // region that is 26 notes and no information; as communities it is the planted structure.
        const ideas = [
            ...clique("a", 6),
            ...clique("b", 6),
            ...clique("c", 6),
            ...clique("d", 6),
            idea("bridge-ab.md", "permanent", [{ to: "a-0.md" }, { to: "b-0.md" }]),
            idea("bridge-bc.md", "permanent", [{ to: "b-1.md" }, { to: "c-0.md" }]),
            idea("bridge-cd.md", "permanent", [{ to: "c-1.md" }, { to: "d-0.md" }]),
        ];
        const model = buildModel(ideas);
        expect(buildKnowledgeMap(model).clusters).toHaveLength(1); // one region: no information

        const communities = communitiesOf(model);
        expect(communities.length).toBeGreaterThanOrEqual(4);
        expect(communities.every((community) => community.members.length + 1 > 1)).toBe(true);

        // Each planted clique lands whole inside one community.
        for (const prefix of ["a", "b", "c", "d"]) {
            const homes = new Set(
                Array.from({ length: 6 }, (_, n) =>
                    communities.findIndex((community) =>
                        [community.hub, ...community.members].includes(`${prefix}-${n}.md`)
                    )
                )
            );
            expect({ prefix, split: homes.size }).toEqual({ prefix, split: 1 });
        }
    });

    it("gives the same answer twice", () => {
        // Louvain is order-sensitive, so the order is fixed: path order for the walk, lowest
        // community id for a tie. Asserted anyway — "by construction" has been wrong here before.
        const model = buildModel([...clique("a", 5), ...clique("b", 5), joined("a", "b")]);
        expect(communitiesOf(model)).toEqual(communitiesOf(model));
    });

    it("never lets a community straddle a region", () => {
        const model = buildModel([...clique("a", 5), ...clique("b", 5)]); // two separate components
        const map = buildKnowledgeMap(model);
        const regionOf = new Map<string, string>();
        for (const cluster of map.clusters) {
            for (const path of [cluster.hub, ...cluster.members]) regionOf.set(path, cluster.hub);
        }
        for (const community of communitiesOf(model)) {
            const regions = new Set([community.hub, ...community.members].map((path) => regionOf.get(path)));
            expect({ community: community.hub, regions: regions.size }).toEqual({ community: community.hub, regions: 1 });
            expect(regions.has(community.region)).toBe(true);
        }
    });

    it("names a community after its most connected note", () => {
        const model = buildModel([
            idea("centre.md", "permanent", [{ to: "leaf1.md" }, { to: "leaf2.md" }, { to: "leaf3.md" }]),
            idea("leaf1.md", "permanent"),
            idea("leaf2.md", "permanent"),
            idea("leaf3.md", "permanent"),
        ]);
        expect(communitiesOf(model)[0].hub).toBe("centre.md");
    });
});

describe("what a community is not (#524)", () => {
    it("is never one note on its own", () => {
        const model = buildModel([idea("a.md", "permanent", [{ to: "b.md" }]), idea("b.md", "permanent")]);
        const communities = communitiesOf(model);
        expect(communities).toHaveLength(1);
        expect(communities[0].members).toEqual(["b.md"]);
    });

    it("never contains a note that is alone", () => {
        // An alone note is already `KnowledgeMap.unclustered`. The same fact in two places is how
        // the two drift apart.
        const model = buildModel([...clique("a", 4), idea("alone.md", "permanent")]);
        const placed = communitiesOf(model).flatMap((community) => [community.hub, ...community.members]);
        expect(placed).not.toContain("alone.md");
        expect(buildKnowledgeMap(model).unclustered).toEqual(["alone.md"]);
    });

    it("is empty for an empty model, and never throws", () => {
        expect(communitiesOf(buildModel([]))).toEqual([]);
    });

    it("orders by size, largest first, and sorts its members", () => {
        const model = buildModel([...clique("small", 3), ...clique("big", 7), joined("small", "big")]);
        const communities = communitiesOf(model);
        const sizes = communities.map((community) => community.members.length + 1);
        expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
        for (const community of communities) {
            expect([...community.members].sort()).toEqual(community.members);
        }
    });
});
