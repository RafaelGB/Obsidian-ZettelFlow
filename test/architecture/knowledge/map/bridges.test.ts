import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { build3DGraph, graph3dStats, OVERLAY_KINDS, OVERLAY_SPECS } from "architecture/knowledge/map/graph3d";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";
import type { Idea } from "architecture/knowledge/model/Idea";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const RENDERER = read("src/architecture/components/core/graph3d/Graph3DRenderer.ts");

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

function code(source: string): string {
    return source
        .split("\n")
        .filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
        })
        .join("\n");
}

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

    it("branches once per kind of predicate, not once per lens", () => {
        // The next edge lens must cost one table entry, not another branch in the renderer.
        expect((code(RENDERER).match(/\.on === "edge"/g) ?? []).length).toBeLessThanOrEqual(4);
    });
});

describe("the picture reads as what joins what (#526)", () => {
    it("lights the crossing links and dims the rest", () => {
        const colour = code(RENDERER).slice(code(RENDERER).indexOf("private computeLinkColor"));
        const body = colour.slice(0, colour.indexOf("private computeLinkWidth"));
        expect(body).toContain("edgeLens");
        expect(body).toContain("DIM_LINK");
    });

    it("draws them thicker, so 26 lines are findable in a graph of hundreds", () => {
        const width = code(RENDERER).slice(code(RENDERER).indexOf("private computeLinkWidth"));
        expect(width.slice(0, 600)).toContain("edgeLens");
    });

    it("keeps both endpoints lit while everything else dims", () => {
        const node = code(RENDERER).slice(code(RENDERER).indexOf("private computeNodeColor"));
        expect(node.slice(0, 900)).toContain("edgeLensEndpoints");
    });
});

describe("it changes paint and nothing else (#526)", () => {
    it("hides nothing and filters nothing", () => {
        // Same rule framing got in #515: nothing disappears under you, so a later refactor cannot
        // turn "show me this" into "hide the rest" in silence.
        const sync = code(RENDERER).slice(code(RENDERER).indexOf("private syncEdgeLens"));
        const body = sync.slice(0, 700);
        expect(body).not.toContain("filterGraph3D");
        expect(body).not.toContain("hiddenNodes");
        expect(body).not.toContain("setLit");
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

describe("the lens keeps up with the data (#526)", () => {
    it("is recomputed when the displayed set moves under it", () => {
        // The endpoint set is cached once per lens change rather than per node per frame, which
        // means a time cursor or a reindex would otherwise light notes that are no longer joined.
        const apply = code(RENDERER).slice(code(RENDERER).indexOf("private applyGraphData"));
        expect(apply.slice(0, 600)).toContain("this.syncEdgeLens()");
    });
});
