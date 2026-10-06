import { describe, it, expect } from "@jest/globals";
import { build3DGraph, graph3dStats, OVERLAY_KINDS, OVERLAY_SPECS } from "architecture/knowledge/map/graph3d";
import { buildScene } from "architecture/components/core/graph/graphScene";
import { allocatePaint, paint, EDGE_TRAVEL, type PaintState } from "architecture/components/core/graph/graphPaint";
import { readGraphTheme } from "architecture/components/core/graph/graphTheme";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";
import type { Idea } from "architecture/knowledge/model/Idea";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";


/**
 * **A lens can light an edge** (#526, epic #522).
 *
 * A bridge is everywhere your thinking crosses from one neighbourhood into another — 26 edges in
 * the reference vault, and on one screen the most interesting single picture the product draws.
 *
 * It is the one thing the renderer genuinely could not say. Every lens so far was a statement
 * about notes, and no amount of node-matching expresses it: lighting both endpoints of the 26
 * bridges lights 48 notes and tells you nothing about *which* of their links crosses.
 */

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

describe("a bridge is an edge, not a note (#526)", () => {
    it("marks exactly the links whose ends are in different neighbourhoods", () => {
        const graph = build3DGraph(
            buildModel([
                ...clique("a", 5),
                ...clique("b", 5),
                idea("x.md", "permanent", [{ to: "a-0.md" }, { to: "b-0.md" }]),
            ])
        );
        const communityOf = new Map(graph.nodes.map((node) => [node.id, node.community]));
        for (const link of graph.links) {
            const crosses = communityOf.get(link.source) !== communityOf.get(link.target);
            expect({ edge: `${link.source}→${link.target}`, bridge: link.bridge }).toEqual({
                edge: `${link.source}→${link.target}`,
                bridge: crosses,
            });
        }
        expect(graph3dStats(graph).bridges).toBeGreaterThan(0);
    });

    it("counts none when the groups are separate components", () => {
        // Nothing crosses because there is nothing to cross: a bridge needs two neighbourhoods
        // that are actually joined.
        const graph = build3DGraph(buildModel([...clique("a", 5), ...clique("b", 5)]));
        expect(graph3dStats(graph).bridges).toBe(0);
        expect(graph.links.every((link) => !link.bridge)).toBe(true);
    });

    it("never marks an edge inside one neighbourhood", () => {
        const graph = build3DGraph(buildModel(clique("a", 6)));
        expect(graph.links.every((link) => !link.bridge)).toBe(true);
    });
});

describe("the lens table learned a second kind (#526)", () => {
    it("says what each lens is about", () => {
        expect(OVERLAY_KINDS).toContain("bridges");
        expect(OVERLAY_SPECS.bridges.on).toBe("edge");
        for (const kind of ["orphans", "dead-ends", "contradictions", "alone", "frontier"] as const) {
            expect({ kind, on: OVERLAY_SPECS[kind].on }).toEqual({ kind, on: "node" });
        }
    });

    it("matches an edge by the flag the model computed", () => {
        const spec = OVERLAY_SPECS.bridges;
        expect(spec.on === "edge" && spec.matches({ bridge: true } as never)).toBe(true);
        expect(spec.on === "edge" && spec.matches({ bridge: false } as never)).toBe(false);
    });

});

/** Paint the graph of two cliques joined by one link, with the bridges asked about (#526, #696). */
function paintBridges(): { lit: Float32Array; width: Float32Array; flags: Float32Array; bridgeAt: number; insideAt: number; endpointsLit: boolean } {
    const graph = build3DGraph(buildModel([...clique("a", 4), ...clique("b", 4).map((each, n) => (n === 0 ? { ...each, relations: [...each.relations, { to: "a-0.md", type: "link" }] } : each))]));
    const scene = buildScene(graph);
    const theme = readGraphTheme(() => "#808080");
    const buffers = allocatePaint(scene, 0);
    const bridgeEnds = new Set<number>();
    for (let l = 0; l < scene.bridge.length; l++) {
        if (scene.bridge[l]) {
            bridgeEnds.add(scene.edges[l * 2]);
            bridgeEnds.add(scene.edges[l * 2 + 1]);
        }
    }
    const state: PaintState = { colorBy: "region", lit: bridgeEnds, focus: null, fade: 1, timeCursor: Infinity, edgeAsk: "bridges", hubs: new Set() };
    paint(scene, theme, state, buffers);
    const bridgeAt = scene.bridge.indexOf(1);
    const insideAt = scene.bridge.indexOf(0);
    const alpha = new Float32Array(scene.bridge.length);
    for (let l = 0; l < alpha.length; l++) alpha[l] = buffers.edgeColor[l * 4 + 3];
    const endpointsLit = [...bridgeEnds].every((i) => buffers.nodeColor[i * 4 + 3] === 1);
    return { lit: alpha, width: buffers.edgeWidth, flags: buffers.edgeFlags, bridgeAt, insideAt, endpointsLit };
}

describe("the picture reads as what joins what (#526, #696)", () => {
    it("lights the crossing links and dims the rest", () => {
        const painted = paintBridges();
        expect(painted.bridgeAt).toBeGreaterThanOrEqual(0);
        expect(painted.lit[painted.bridgeAt]).toBeGreaterThan(painted.lit[painted.insideAt]);
    });

    it("draws them thicker, with light travelling along them", () => {
        const painted = paintBridges();
        expect(painted.width[painted.bridgeAt]).toBeGreaterThan(painted.width[painted.insideAt]);
        expect(painted.flags[painted.bridgeAt] & EDGE_TRAVEL).toBe(EDGE_TRAVEL);
    });

    it("keeps both endpoints lit while everything else dims", () => {
        expect(paintBridges().endpointsLit).toBe(true);
    });
});

describe("it changes paint and nothing else (#526)", () => {
    it("hides nothing and filters nothing: every note and link is still drawn", () => {
        // Same rule framing got in #515: nothing disappears under you. A dimmed link keeps a width
        // and an alpha above zero; only time (#697) may take something off the screen.
        const painted = paintBridges();
        expect([...painted.width].every((w) => w > 0)).toBe(true);
        expect([...painted.lit].every((a) => a > 0)).toBe(true);
    });
});

describe("it states, and never advises (#526)", () => {
    it("names the lens in both locales", () => {
        const REPROACH = [/\bshould\b/i, /\byou have\b/i, /\bdeberías\b/i, /\bconecta\b/i, /\btodavía\b/i];
        for (const [name, locale] of [["en", en], ["es", es]] as const) {
            const value = (locale as Record<string, string>).graph3d_overlay_bridges;
            expect({ name, present: typeof value === "string" }).toEqual({ name, present: true });
            expect({ name, offends: REPROACH.some((p) => p.test(value)) }).toEqual({ name, offends: false });
        }
    });
});
