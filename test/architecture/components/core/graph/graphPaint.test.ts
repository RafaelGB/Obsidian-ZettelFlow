import { describe, it, expect } from "@jest/globals";
import { build3DGraph } from "architecture/knowledge/map/graph3d";
import { buildScene } from "architecture/components/core/graph/graphScene";
import { allocatePaint, EDGE_DASHED, EDGE_GHOST, paint, type PaintState } from "architecture/components/core/graph/graphPaint";
import { readGraphTheme } from "architecture/components/core/graph/graphTheme";
import { idea, buildModel } from "../../../../actions/knowledge/support/knowledgeFixture";

const COLOURS: Record<string, string> = {
    "--background-primary": "#1e1e1e",
    "--color-blue": "#0000ff",
    "--color-green": "#00ff00",
    "--color-red": "#ff0000",
};
const theme = readGraphTheme((name) => COLOURS[name] ?? "#a0a0a0");
const model = buildModel([
    idea("a.md", "permanent", [{ to: "b.md" }], { created: 1_000 }),
    idea("b.md", "fleeting", [{ to: "c.md" }], { created: 2_000 }),
    idea("c.md", "fleeting", [], { created: 3_000 }),
]);
const scene = buildScene(build3DGraph(model));
const at = (path: string) => scene.index.get(path) as number;

function state(over: Partial<PaintState> = {}): PaintState {
    return { colorBy: "region", lit: null, focus: null, fade: 1, timeCursor: Infinity, edgeAsk: null, hubs: new Set(), ...over };
}

function painted(over: Partial<PaintState> = {}, ghosts?: Uint32Array) {
    const buffers = allocatePaint(scene, 4);
    paint(scene, theme, state(over), buffers, ghosts);
    return buffers;
}

const alpha = (buffers: ReturnType<typeof painted>, i: number) => buffers.nodeColor[i * 4 + 3];

/**
 * **The paint** (#693, #695): one pass over numbers decides every colour. Nothing is hidden by an
 * answer — it dims; only time takes a note off the screen.
 */
describe("the paint (#693, #695)", () => {
    it("draws everything at full strength when nothing is asked", () => {
        const buffers = painted();
        for (let i = 0; i < scene.n; i++) expect(alpha(buffers, i)).toBe(1);
    });

    it("dims what the answer does not hold, and never to nothing", () => {
        const buffers = painted({ lit: new Set([at("a.md")]) });
        expect(alpha(buffers, at("a.md"))).toBe(1);
        expect(alpha(buffers, at("c.md"))).toBeLessThan(0.5);
        expect(alpha(buffers, at("c.md"))).toBeGreaterThan(0);
    });

    it("eases the dimming in with the fade", () => {
        const half = painted({ lit: new Set([at("a.md")]), fade: 0.5 });
        const full = painted({ lit: new Set([at("a.md")]), fade: 1 });
        expect(alpha(half, at("c.md"))).toBeGreaterThan(alpha(full, at("c.md")));
    });

    it("lets a focused neighbourhood win over the answer", () => {
        const buffers = painted({ lit: new Set([at("a.md")]), focus: new Set([at("c.md")]) });
        expect(alpha(buffers, at("c.md"))).toBe(1);
        expect(alpha(buffers, at("a.md"))).toBeLessThan(1);
    });

    it("takes a note off the screen until the moment it was made (#697)", () => {
        const buffers = painted({ timeCursor: 1_500 });
        expect(alpha(buffers, at("a.md"))).toBe(1);
        expect(alpha(buffers, at("b.md"))).toBe(0);
        expect(buffers.nodeSize[at("b.md")]).toBe(0);
        // …and every link to it.
        for (let l = 0; l < scene.linkCount; l++) {
            const ends = [scene.edges[l * 2], scene.edges[l * 2 + 1]];
            if (ends.includes(at("b.md"))) expect(buffers.edgeColor[l * 4 + 3]).toBe(0);
        }
    });

    it("colours by maturity when asked to", () => {
        const byState = painted({ colorBy: "state" });
        const byRegion = painted({ colorBy: "region" });
        expect(Array.from(byState.nodeColor.slice(0, 3))).not.toEqual(Array.from(byRegion.nodeColor.slice(0, 3)));
    });

    it("draws ghost pairs after the links, dashed (#532)", () => {
        const buffers = painted({}, new Uint32Array([at("a.md"), at("c.md")]));
        expect(buffers.ghosts).toBe(1);
        const g = scene.linkCount;
        expect(buffers.edgeFlags[g] & EDGE_GHOST).toBe(EDGE_GHOST);
        expect(buffers.edgeFlags[g] & EDGE_DASHED).toBe(EDGE_DASHED);
        expect(buffers.edgeColor[g * 4 + 3]).toBeGreaterThan(0);
    });
});
