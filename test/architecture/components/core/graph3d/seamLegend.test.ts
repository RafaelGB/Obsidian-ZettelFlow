import { describe, it, expect } from "@jest/globals";
import {
    SEAM_LEGEND_MAX,
    belongsToCommunity,
    belongsToSeam,
    communityFrameKey,
    legendShowsSeams,
    neighbourhoodRows,
    paletteOf,
    regionFrameKey,
    seamFrameKey,
    seamRows,
} from "architecture/components/core/graph3d/graph3dLegend";
import { COMMUNITY_COLORS, type Graph3DData, type Graph3DNode, type GapSeam } from "architecture/knowledge/state";

/**
 * **Fly to the widest seam** (#533, epic #529).
 *
 * The lens draws every gap it can, and on a real vault that is 217 dashed lines. A picture of
 * everything is a picture of nothing — what the epic promised is a *place*, and a place is
 * something you can **go to**. The seams are that list; the graph already knows how to fly.
 *
 * Every number the legend shows and every predicate the camera gets is computed here, in a pure
 * module, because `jest.config.js` runs `testEnvironment: "node"`: the view cannot be mounted, so
 * the arithmetic is tested directly and the wiring is source-scanned.
 */
const node = (id: string, community: number, name: string, region = "R"): Graph3DNode =>
    ({ id, name: id, val: 1, group: 0, region, community, communityName: name }) as Graph3DNode;

const screen = (nodes: Graph3DNode[]): Graph3DData => ({ nodes, links: [] }) as Graph3DData;

const seam = (a: number, b: number, gaps: number, links: number, labelA = `n${a}`, labelB = `n${b}`): GapSeam => ({
    a,
    b,
    labelA,
    labelB,
    gaps,
    score: gaps * 2,
    links,
});

describe("a neighbourhood is an index, not a name (#533, FR-4, AC-4)", () => {
    // The defect, as the reference vault has it: two different communities both called `readme`.
    const twoReadmes = [
        node("a.md", 0, "readme"),
        node("b.md", 0, "readme"),
        node("c.md", 0, "readme"),
        node("d.md", 3, "readme"),
        node("e.md", 3, "readme"),
    ];

    it("keeps two same-named neighbourhoods apart, with their own sizes", () => {
        const { rows } = neighbourhoodRows(twoReadmes);
        expect(rows).toHaveLength(2);
        expect(rows.map((row) => row.size)).toEqual([3, 2]);
        expect(rows.map((row) => row.community)).toEqual([0, 3]);
        // Distinct framing keys, or the pressed state would light both rows at once.
        expect(new Set(rows.map((row) => communityFrameKey(row.community))).size).toBe(2);
    });

    it("frames one of them and not the other", () => {
        const first = belongsToCommunity(0);
        expect(twoReadmes.filter(first).map((one) => one.id)).toEqual(["a.md", "b.md", "c.md"]);
        expect(twoReadmes.filter(belongsToCommunity(3)).map((one) => one.id)).toEqual(["d.md", "e.md"]);
    });

    it("counts an alone note as alone, and puts it in no row", () => {
        const { rows, alone } = neighbourhoodRows([...twoReadmes, node("lonely.md", -1, "")]);
        expect(alone).toBe(1);
        expect(rows.flatMap((row) => row.size)).toEqual([3, 2]);
        expect(belongsToCommunity(-1)(node("lonely.md", -1, ""))).toBe(true); // the predicate is honest…
        expect(rows.some((row) => row.community === -1)).toBe(false); // …but no row offers it
    });

    it("orders by size, then name, then index — deterministic for a tie", () => {
        const tied = [node("a.md", 5, "same"), node("b.md", 2, "same")];
        expect(neighbourhoodRows(tied).rows.map((row) => row.community)).toEqual([2, 5]);
    });

    it("namespaces the framing keys, so a region and a community cannot collide", () => {
        expect(communityFrameKey(3)).not.toBe(regionFrameKey("3"));
        expect(seamFrameKey(1, 2)).toBe(seamFrameKey(2, 1));
        expect(seamFrameKey(1, 2)).not.toBe(communityFrameKey(1));
    });

    it("gives a row the same colour the scene gives its nodes", () => {
        expect(paletteOf(0)).toBe(0);
        expect(paletteOf(COMMUNITY_COLORS.length)).toBe(0);
        expect(paletteOf(COMMUNITY_COLORS.length + 2)).toBe(2);
    });
});

describe("the widest seams that fit on screen (#533, FR-1, AC-1, AC-5, AC-6)", () => {
    const displayed = screen([node("a.md", 0, "n0"), node("b.md", 1, "n1"), node("c.md", 2, "n2")]);

    it("takes them in the order gapSeams handed them over, and never sorts", () => {
        const seams = [seam(0, 1, 9, 0), seam(0, 2, 4, 1), seam(1, 2, 4, 3)];
        const rows = seamRows(seams, displayed);
        expect(rows.map((row) => [row.labelA, row.labelB, row.gaps, row.links])).toEqual([
            ["n0", "n1", 9, 0],
            ["n0", "n2", 4, 1],
            ["n1", "n2", 4, 3],
        ]);
        expect(rows[0].paletteA).toBe(paletteOf(0));
        expect(rows[0].paletteB).toBe(paletteOf(1));
    });

    it("caps at SEAM_LEGEND_MAX, keeping the widest", () => {
        expect(SEAM_LEGEND_MAX).toBe(8);
        const many = Array.from({ length: 12 }, (_, index) => seam(0, 1, 12 - index, 0, `x${index}`, `y${index}`));
        const rows = seamRows(many, displayed);
        expect(rows).toHaveLength(SEAM_LEGEND_MAX);
        expect(rows.map((row) => row.gaps)).toEqual([12, 11, 10, 9, 8, 7, 6, 5]);
        // No two rows show the same pair of labels — #531's qualification carries through.
        expect(new Set(rows.map((row) => `${row.labelA}|${row.labelB}`)).size).toBe(rows.length);
    });

    it("drops a seam with a side that is not on screen", () => {
        // The time-lapse rule, the same one the ghost edges follow: a row you cannot fly to lies.
        const rows = seamRows([seam(0, 9, 30, 0), seam(0, 1, 2, 0)], displayed);
        expect(rows.map((row) => [row.a, row.b])).toEqual([[0, 1]]);
    });

    it("has nothing to list when there are no seams, or no room", () => {
        expect(seamRows([], displayed)).toEqual([]);
        expect(seamRows([seam(0, 1, 5, 0)], displayed, 0)).toEqual([]);
        expect(seamRows([seam(0, 1, 5, 0)], screen([]))).toEqual([]);
    });

    it("frames both sides of a seam, and nothing else", () => {
        const belongs = belongsToSeam(0, 2);
        const nodes = [node("a.md", 0, "n0"), node("b.md", 1, "n1"), node("c.md", 2, "n2")];
        expect(nodes.filter(belongs).map((one) => one.id)).toEqual(["a.md", "c.md"]);
    });
});

describe("the swap happens because of the lens, not a setting (#533, FR-6)", () => {
    it("lists seams only with the gap lens on and colours meaning neighbourhoods", () => {
        expect(legendShowsSeams("gaps", "neighbourhood")).toBe(true);
        expect(legendShowsSeams(null, "neighbourhood")).toBe(false);
        expect(legendShowsSeams("bridges", "neighbourhood")).toBe(false);
        // In the state colour mode the two swatches on a seam row would mean nothing.
        expect(legendShowsSeams("gaps", "state")).toBe(false);
    });
});
