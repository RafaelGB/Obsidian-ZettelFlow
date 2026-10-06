import { describe, it, expect } from "@jest/globals";
import { ALPHA_MIN, createLayout, LAYOUT_TICKS, layoutRadius, rng, seedPositions } from "architecture/components/core/graph/layoutCore";

/** Two dense communities joined by one link, and a note that is alone. */
function twoCommunities() {
    const community = new Int32Array([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, -1]);
    const edges: number[] = [];
    for (const [from, to] of [[0, 5], [5, 10]]) {
        for (let i = from; i < to; i++) for (let j = i + 1; j < to; j++) edges.push(i, j);
    }
    edges.push(0, 5);
    return { n: 11, edges: Uint32Array.from(edges), community, communityCount: 2 };
}

function distance(p: Float32Array, a: number, b: number): number {
    return Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
}

/**
 * **The force layout** (#693, #694): deterministic, settling, and reading as places — a
 * neighbourhood ends up together, which is what a nebula is drawn around.
 */
describe("the layout (#693, #694)", () => {
    it("is deterministic: the same graph and seed give the same picture", () => {
        const a = createLayout(twoCommunities());
        const b = createLayout(twoCommunities());
        for (let i = 0; i < 50; i++) {
            a.tick();
            b.tick();
        }
        expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    });

    it("settles within its tick budget, and stays finite", () => {
        const layout = createLayout(twoCommunities());
        while (!layout.settled() && layout.ticks < LAYOUT_TICKS + 5) layout.tick();
        expect(layout.settled()).toBe(true);
        expect(layout.alpha).toBeLessThan(ALPHA_MIN);
        expect(layout.ticks).toBeLessThanOrEqual(LAYOUT_TICKS + 1);
        expect(Array.from(layout.positions).every(Number.isFinite)).toBe(true);
    });

    it("keeps a neighbourhood together and apart from the next", () => {
        const layout = createLayout(twoCommunities());
        while (!layout.settled()) layout.tick();
        const p = layout.positions;
        const inside = (distance(p, 1, 2) + distance(p, 6, 7)) / 2;
        const across = (distance(p, 1, 7) + distance(p, 2, 6)) / 2;
        expect(across).toBeGreaterThan(inside * 1.5);
    });

    it("only settles what it is told is already known (#694 warm start)", () => {
        const seeded = createLayout(twoCommunities());
        while (!seeded.settled()) seeded.tick();
        const again = createLayout({ ...twoCommunities(), initial: seeded.positions.slice(), alpha: 0.01 });
        let ticks = 0;
        while (!again.settled()) {
            again.tick();
            ticks++;
        }
        expect(ticks).toBeLessThan(LAYOUT_TICKS / 2);
    });

    it("never divides by zero when two notes start on the same spot", () => {
        const layout = createLayout({ n: 2, edges: new Uint32Array([0, 1]), community: new Int32Array([0, 0]), communityCount: 1, initial: new Float32Array(6) });
        for (let i = 0; i < 20; i++) layout.tick();
        expect(Array.from(layout.positions).every(Number.isFinite)).toBe(true);
        expect(distance(layout.positions, 0, 1)).toBeGreaterThan(0);
    });

    it("lays out nothing for an empty graph", () => {
        const layout = createLayout({ n: 0, edges: new Uint32Array(0), community: new Int32Array(0), communityCount: 0 });
        expect(layout.tick()).toBe(0);
        expect(layout.settled()).toBe(true);
    });
});

describe("where the notes start (#694)", () => {
    it("starts a note that is alone outside the communities", () => {
        const start = seedPositions(twoCommunities());
        const r = (i: number) => Math.hypot(start[i * 3], start[i * 3 + 1] / 0.7, start[i * 3 + 2]);
        expect(r(10)).toBeGreaterThan(layoutRadius(11));
    });

    it("draws from a seeded generator, never Math.random", () => {
        const a = rng(42);
        const b = rng(42);
        expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    });
});
