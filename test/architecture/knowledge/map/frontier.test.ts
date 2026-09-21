import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { build3DGraph, graph3dStats, OVERLAY_KINDS, OVERLAY_SPECS } from "architecture/knowledge/map/graph3d";
import { communitiesOf } from "architecture/knowledge/map/communities";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";
import type { Idea } from "architecture/knowledge/model/Idea";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/**
 * **A note that touches more than one** (#525, epic #522).
 *
 * A frontier note sits where two neighbourhoods meet. There are 48 in the reference vault and
 * nothing distinguished them from any other dot.
 *
 * This is the half of the epic that needs no new mechanism. `OVERLAY_SPECS.matches` is
 * `(node) => boolean` and cannot see a neighbour, so "touches more than one community" is
 * precomputed on the node — exactly as `orphan`, `deadEnd` and `contradiction` already are. That
 * is the pattern, and it is why the bridge lens (#526) is a separate issue.
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

describe("the node knows its neighbourhood (#525)", () => {
    it("carries the community index and name, matching the model", () => {
        const model = buildModel([...clique("a", 5), ...clique("b", 5), idea("x.md", "permanent", [{ to: "a-0.md" }, { to: "b-0.md" }])]);
        const graph = build3DGraph(model);
        const communities = communitiesOf(model);

        for (const node of graph.nodes) {
            const home = communities.findIndex((community) => [community.hub, ...community.members].includes(node.id));
            expect({ id: node.id, index: node.community, name: node.communityName }).toEqual({
                id: node.id,
                index: home,
                name: home === -1 ? "" : communities[home].hub.replace(/\.md$/i, ""),
            });
        }
    });

    it("leaves it empty for a note that is alone", () => {
        const graph = build3DGraph(buildModel([idea("alone.md", "seed")]));
        expect(graph.nodes[0]).toMatchObject({ community: -1, communityName: "", frontier: false });
    });
});

describe("a frontier note is one whose neighbours are not all its own (#525)", () => {
    it("holds the definition, whatever the fixture", () => {
        // The property, not a number I guessed in advance: a node is a frontier note exactly when
        // its own community plus its neighbours' communities number more than one.
        const model = buildModel([
            ...clique("a", 5),
            ...clique("b", 5),
            ...clique("c", 5),
            idea("x.md", "permanent", [{ to: "a-0.md" }, { to: "b-0.md" }]),
            idea("y.md", "permanent", [{ to: "b-1.md" }, { to: "c-0.md" }]),
        ]);
        const graph = build3DGraph(model);
        const communityOf = new Map(graph.nodes.map((node) => [node.id, node.community]));
        const neighbours = new Map<string, Set<string>>(graph.nodes.map((node) => [node.id, new Set<string>()]));
        for (const link of graph.links) {
            neighbours.get(link.source)?.add(link.target);
            neighbours.get(link.target)?.add(link.source);
        }

        for (const node of graph.nodes) {
            const span = new Set<number>([node.community]);
            for (const other of neighbours.get(node.id) ?? []) span.add(communityOf.get(other) as number);
            expect({ id: node.id, frontier: node.frontier }).toEqual({ id: node.id, frontier: span.size > 1 });
        }
    });

    it("names both sides of a crossing, not one", () => {
        // A crossing has two sides. `x` links two cliques and lands in one of them; the note it
        // reached on the other side now has a neighbour from elsewhere, so it is a frontier too.
        const model = buildModel([...clique("a", 5), ...clique("b", 5), idea("x.md", "permanent", [{ to: "a-0.md" }, { to: "b-0.md" }])]);
        const graph = build3DGraph(model);
        expect(graph.nodes.find((node) => node.id === "x.md")?.frontier).toBe(true);
        expect(graph3dStats(graph).frontier).toBe(2);
    });

    it("is never a note that is alone, nor a pair that only knows itself", () => {
        const model = buildModel([
            idea("pair-a.md", "permanent", [{ to: "pair-b.md" }]),
            idea("pair-b.md", "permanent"),
            idea("alone.md", "permanent"),
        ]);
        expect(graph3dStats(build3DGraph(model)).frontier).toBe(0);
    });
});

describe("it is one more row in the table (#525)", () => {
    it("joins the lenses without growing a mechanism", () => {
        expect(OVERLAY_KINDS).toContain("frontier");
        expect(OVERLAY_SPECS.frontier.matches({ frontier: true } as never)).toBe(true);
        expect(OVERLAY_SPECS.frontier.matches({ frontier: false } as never)).toBe(false);
    });

    it("counts it for the chip like every other lens", () => {
        expect(read("src/architecture/components/core/graph3d/Graph3DRenderer.ts")).toContain('"frontier": stats.frontier');
    });

    it("names it in both locales without telling you what to do", () => {
        const REPROACH = [/\bshould\b/i, /\byou have\b/i, /\bconnect\b/i, /\bdeberías\b/i, /\bconecta\b/i, /\btodavía\b/i];
        for (const [name, locale] of [["en", en], ["es", es]] as const) {
            const value = (locale as Record<string, string>).graph3d_overlay_frontier;
            expect({ name, present: typeof value === "string" }).toEqual({ name, present: true });
            expect({ name, offends: REPROACH.some((p) => p.test(value)) }).toEqual({ name, offends: false });
        }
    });
});
