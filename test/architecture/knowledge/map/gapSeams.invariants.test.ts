import { describe, it, expect, jest } from "@jest/globals";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { deriveIdea } from "architecture/knowledge/model/Idea";
import { memoStats } from "architecture/knowledge/model/memo";
import { gapTally } from "architecture/knowledge/discovery/discoveries";
import { communitiesOf } from "architecture/knowledge/map/communities";
import { gapSeams } from "architecture/knowledge/map/gapSeams";
import { generateVault } from "../../../perf/generateVault";

/**
 * The two properties `gapSeams` is allowed to assume (#531, epic #529) — asserted, because "by
 * construction" has been wrong in this repo before (#512).
 *
 * Two thousand notes rather than ten: this runs in `npm test`, on every save, and a ten-thousand
 * note model costs seconds there. The same invariant is asserted at the full 10k in the perf suite,
 * where a slow, honest measurement belongs.
 */
function modelOf(count: number, seed = 1): KnowledgeModel {
    const model = new KnowledgeModel();
    model.build(generateVault(count, seed).map((snapshot) => deriveIdea(snapshot, {})));
    return model;
}

describe("a gap never leaves its region (#531, AC-4)", () => {
    it("has both endpoints in a community, and both in the same region", () => {
        const model = modelOf(2_000);
        const communityOf = new Map<string, number>();
        const communities = communitiesOf(model);
        communities.forEach((community, index) => {
            for (const path of [community.hub, ...community.members]) communityOf.set(path, index);
        });

        // Shared context means a common neighbour, and a common neighbour means one connected
        // component — so a gap that crossed a region would mean the implementation is wrong, not
        // that the vault is unusual. Collected rather than counted, so a failure names the pair.
        //
        // The "belongs to no community" half is weaker than it looks, and only holds here because
        // `generateVault` links every note to notes that exist: a broken link produces a candidate
        // pair between two notes that do not exist, and those are in no community (#538).
        const violations: string[] = [];
        for (const gap of gapTally(model).candidates()) {
            const from = communityOf.get(gap.a);
            const to = communityOf.get(gap.b);
            if (from === undefined || to === undefined) {
                violations.push(`${gap.a} <-> ${gap.b}: an endpoint belongs to no community`);
                continue;
            }
            if (communities[from].region !== communities[to].region) {
                violations.push(`${gap.a} <-> ${gap.b}: ${communities[from].region} vs ${communities[to].region}`);
            }
        }
        expect(violations).toEqual([]);
        expect(gapTally(model).size).toBeGreaterThan(0); // or the assertion above proves nothing
    });
});

describe("the seams never walk the graph (#531, AC-6, FR-5)", () => {
    it("reads the shared tally and each idea's own relations, and nothing else", () => {
        const model = modelOf(2_000, 5);
        // Warm the two projections it is allowed to depend on, so what is counted below is the
        // aggregation itself.
        gapTally(model);
        communitiesOf(model);

        const out = jest.spyOn(model, "outNeighborSet");
        const incoming = jest.spyOn(model, "inNeighborSet");
        const edge = jest.spyOn(model, "hasEdge");
        try {
            gapSeams(model);
        } finally {
            out.mockRestore();
            incoming.mockRestore();
            edge.mockRestore();
        }

        // A private candidate pass in here would double the heaviest projection in the product.
        expect(out).toHaveBeenCalledTimes(0);
        expect(incoming).toHaveBeenCalledTimes(0);
        expect(edge).toHaveBeenCalledTimes(0);
    });

    it("computes once per revision", () => {
        const model = modelOf(500, 9);
        const first = gapSeams(model);
        const entries = memoStats(model).entries;
        expect(gapSeams(model)).toBe(first);
        expect(memoStats(model).entries).toBe(entries);
    });
});
