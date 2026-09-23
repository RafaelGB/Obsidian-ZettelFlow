import { describe, it, expect } from "@jest/globals";
import { OVERLAY_KINDS, OVERLAY_SPECS, graph3dSignature, type Graph3DData } from "architecture/knowledge/map/graph3d";
import { selectGhosts, GAP_DRAW_MAX, ghostKey } from "architecture/components/core/graph3d/graph3dGhosts";
import { openGapCount, openGaps } from "architecture/knowledge/judgement/gapVerdict";
import { gapVerdict } from "architecture/knowledge/judgement/gapVerdict";
import { idea, buildModel } from "../../../../actions/knowledge/support/knowledgeFixture";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

/**
 * **The map draws what is not there** (#532, epic #529).
 *
 * Every lens so far narrows what is already in `Graph3DData`: a node predicate for six of them, an
 * edge predicate since #526. A **gap** is a pair of notes that share context and were never
 * linked, so there is nothing in the data to match — the thing being drawn does not exist.
 *
 * That is a third **kind** of lens, not a seventh special case, and the difference is load-bearing:
 * the renderer branches once per kind, so a candidate lens cannot quietly acquire a predicate that
 * would have to lie about something.
 */
describe("a third kind of lens, one that draws candidates (#532, FR-1, AC-1)", () => {
    it("has a gaps lens, and it matches nothing because there is nothing to match", () => {
        expect(OVERLAY_KINDS).toContain("gaps");
        const spec = OVERLAY_SPECS.gaps;
        expect(spec.on).toBe("candidate");
        expect("matches" in spec).toBe(false);
        expect(spec.colorVar.startsWith("--")).toBe(true);
    });

    it("leaves the six that were already there exactly as they were", () => {
        expect(OVERLAY_SPECS.bridges.on).toBe("edge");
        for (const kind of ["orphans", "dead-ends", "contradictions", "alone", "frontier"] as const) {
            expect(OVERLAY_SPECS[kind].on).toBe("node");
        }
    });

    it("keeps the kinds and the table in step, so a new lens cannot skip the table", () => {
        expect(new Set(OVERLAY_KINDS).size).toBe(OVERLAY_KINDS.length);
        expect(Object.keys(OVERLAY_SPECS).sort()).toEqual([...OVERLAY_KINDS].sort());
    });
});

describe("the lens has a name, in both languages (#532, FR-10, AC-9)", () => {
    it("names it in en and es", () => {
        expect(en.graph3d_overlay_gaps).toBe("Gaps");
        expect(es.graph3d_overlay_gaps).toBe("Huecos");
    });

    it("states rather than advises, and is sentence case", () => {
        for (const label of [en.graph3d_overlay_gaps, es.graph3d_overlay_gaps]) {
            // A gap is a fact about the graph. "Link these" would be the surface deciding what you
            // came for (§XII), and the other lens labels are nouns for the same reason.
            expect(label).not.toMatch(/should|deber|link these|enlaza|conecta/i);
            // Sentence case: one leading capital, and no Title Case Second Word.
            expect(label.split(" ").slice(1).every((word) => word[0] !== word[0]?.toUpperCase())).toBe(true);
        }
    });
});

/** A graph of `count` notes called `n0`…, with one real link, and nothing else. */
function screen(count: number): Graph3DData {
    return {
        nodes: Array.from({ length: count }, (_, index) => ({
            id: `n${index}.md`,
            name: `n${index}`,
            val: 1,
            group: 0,
            region: "r",
            community: 0,
            communityName: "c",
            state: "permanent",
            orphan: false,
            deadEnd: false,
            contradiction: false,
            frontier: false,
            created: 0,
            kind: "note" as const,
        })),
        links: [{ source: "n0.md", target: "n1.md", type: "link", bridge: false }],
    };
}

const gap = (a: string, b: string, score: number) => ({ a, b, score });

describe("only the gaps whose both notes are on screen (#532, FR-5, AC-4)", () => {
    it("drops a pair with an endpoint that is not rendered", () => {
        const displayed = screen(3);
        const withBoth = selectGhosts(displayed, [gap("n0.md", "n2.md", 4), gap("n1.md", "n2.md", 2)]);
        const withOne = selectGhosts(displayed, [gap("n0.md", "n2.md", 4), gap("n1.md", "gone.md", 2)]);
        expect(withBoth.edges).toHaveLength(2);
        expect(withOne.edges).toHaveLength(1);
        expect(withOne.edges[0]).toEqual({ a: "n0.md", b: "n2.md", score: 4 });
    });

    it("lights exactly the notes of the lines it drew, and no others", () => {
        const { edges, endpoints } = selectGhosts(screen(4), [
            gap("n0.md", "n1.md", 4),
            gap("n2.md", "gone.md", 3),
        ]);
        expect(edges).toHaveLength(1);
        expect([...endpoints].sort()).toEqual(["n0.md", "n1.md"]);
        expect(endpoints.has("n2.md")).toBe(false); // its line was not drawn, so it is not lit
    });

    it("has nothing to draw, and says so rather than throwing", () => {
        expect(selectGhosts(screen(2), [])).toEqual({ edges: [], endpoints: new Set() });
        expect(selectGhosts({ nodes: [], links: [] }, [gap("a.md", "b.md", 9)]).edges).toEqual([]);
    });
});

describe("bounded, and strongest first (#532, FR-5b, AC-5)", () => {
    it("draws at most GAP_DRAW_MAX, taking the strongest", () => {
        const displayed = screen(41);
        // Forty candidates, already ordered the way `topGaps` hands them over.
        const strongest = Array.from({ length: 40 }, (_, index) => gap("n0.md", `n${index + 1}.md`, 40 - index));
        const { edges } = selectGhosts(displayed, strongest);
        expect(GAP_DRAW_MAX).toBe(30);
        expect(edges).toHaveLength(30);
        expect(edges.map((edge) => edge.score)).toEqual(strongest.slice(0, 30).map((edge) => edge.score));
        for (let index = 1; index < edges.length; index++) {
            expect(edges[index - 1].score).toBeGreaterThanOrEqual(edges[index].score);
        }
    });

    it("draws none when asked for none", () => {
        expect(selectGhosts(screen(3), [gap("n0.md", "n1.md", 2)], 0).edges).toEqual([]);
        expect(selectGhosts(screen(3), [gap("n0.md", "n1.md", 2)], -5).edges).toEqual([]);
    });

    it("keys a line by its pair, so a redraw finds the one it already has", () => {
        expect(ghostKey(gap("a.md", "b.md", 1))).toBe(ghostKey(gap("a.md", "b.md", 9)));
        expect(ghostKey(gap("a.md", "b.md", 1))).not.toBe(ghostKey(gap("b.md", "a.md", 1)));
    });
});

describe("paint only: the graph goes in frozen and comes out untouched (#532, AC-2, AC-3)", () => {
    it("changes no node, no link and no signature", () => {
        const displayed = screen(5);
        for (const node of displayed.nodes) Object.assign(node, { x: 1.5, y: -2, z: 3 });
        const before = graph3dSignature(displayed);
        const links = [...displayed.links];
        const positions = displayed.nodes.map((node) => ({ ...(node as unknown as Record<string, number>) }));

        // Frozen to the bone: a selector that mutated anything would throw here in strict mode,
        // and the assertions below catch it in sloppy mode.
        Object.freeze(displayed.nodes);
        Object.freeze(displayed.links);
        for (const node of displayed.nodes) Object.freeze(node);
        Object.freeze(displayed);

        selectGhosts(displayed, [gap("n0.md", "n2.md", 4), gap("n1.md", "n3.md", 2)]);

        expect(graph3dSignature(displayed)).toBe(before);
        displayed.links.forEach((link, index) => expect(link).toBe(links[index]));
        displayed.nodes.forEach((node, index) => {
            const live = node as unknown as Record<string, number>;
            expect([live.x, live.y, live.z]).toEqual([positions[index].x, positions[index].y, positions[index].z]);
        });
    });
});

/**
 * **The map honours what you ruled out** (#534, T7).
 *
 * The lens draws what `openGaps` hands it, so a pair you called *not related* is not among the
 * candidates and no line is drawn for it. The wiring that chooses the filtered read is source-scanned
 * in `gapLens.paintOnly.test.ts` (no jsdom, so the view cannot be mounted); what is exercised here is
 * that the drawn set is exactly the filtered source, and the chip's count is the filtered count.
 */
describe("the map draws only the gaps you have not ruled out (#534, AC-1)", () => {
    const model = buildModel([
        idea("hub.md", "permanent", [{ to: "a.md" }, { to: "b.md" }, { to: "c.md" }]),
        idea("a.md", "permanent", []),
        idea("b.md", "permanent", []),
        idea("c.md", "permanent", []),
    ]);
    const displayed: Graph3DData = {
        nodes: ["hub.md", "a.md", "b.md", "c.md"].map((id) => ({
            id,
            label: id,
            state: "permanent",
            degree: 1,
        })) as never,
        links: [],
    };
    const ruled = [{ at: 1_700_000_000_000, ...gapVerdict("a.md", "b.md") }];

    it("loses the line for the pair, and one from the count", () => {
        expect(openGapCount(model, [])).toBe(3);
        expect(openGapCount(model, ruled)).toBe(2);

        const before = selectGhosts(displayed, openGaps(model, [], GAP_DRAW_MAX));
        const after = selectGhosts(displayed, openGaps(model, ruled, GAP_DRAW_MAX));
        expect(before.edges).toHaveLength(3);
        expect(after.edges).toHaveLength(2);
        expect(after.edges.map(ghostKey)).not.toContain(ghostKey({ a: "a.md", b: "b.md", score: 2 } as never));
    });

    it("stops drawing anything once every gap is ruled out", () => {
        const all = [
            { at: 1, ...gapVerdict("a.md", "b.md") },
            { at: 2, ...gapVerdict("a.md", "c.md") },
            { at: 3, ...gapVerdict("b.md", "c.md") },
        ];
        expect(openGapCount(model, all)).toBe(0);
        expect(selectGhosts(displayed, openGaps(model, all, GAP_DRAW_MAX)).edges).toEqual([]);
    });
});
