import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { build3DGraph, graph3dStats, OVERLAY_KINDS, OVERLAY_SPECS } from "architecture/knowledge/map/graph3d";
import { idea, buildModel } from "../../../../actions/knowledge/support/knowledgeFixture";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const RENDERER = read("src/architecture/components/core/graph3d/Graph3DRenderer.ts");

/**
 * **Alone looks like alone** (#516, epic #512).
 *
 * The measurement that opened the epic found **82 notes with no link at all — 19 %** of the vault,
 * the largest actionable signal in it. Bridges and frontiers, the lenses the original plan asked
 * for, have five edges between them across the whole graph.
 *
 * This issue shipped smaller than it was written. Its first two requirements described an
 * empty-scene bug that does not exist — `addLensChip` disables a lens at zero and shows the count —
 * and its third asked for an `alone` field that #513 had already produced as `group === -1`. Both
 * were withdrawn in the issue rather than built.
 */

describe("alone is a lens (#516)", () => {
    it("counts the notes with no link, among notes that have them", () => {
        const linked = Array.from({ length: 7 }, (_, n) =>
            idea(`c-${n}.md`, "permanent", n + 1 < 7 ? [{ to: `c-${n + 1}.md` }] : [])
        );
        const alone = Array.from({ length: 3 }, (_, n) => idea(`alone-${n}.md`, "seed", []));
        const graph = build3DGraph(buildModel([...linked, ...alone]));
        expect(graph.nodes).toHaveLength(10);
        expect(graph3dStats(graph).alone).toBe(3);
    });

    it("joins the existing table rather than growing a mechanism", () => {
        expect(OVERLAY_KINDS).toContain("alone");
        expect(typeof OVERLAY_SPECS.alone.matches).toBe("function");
        expect(OVERLAY_SPECS.alone.matches({ group: -1 } as never)).toBe(true);
        expect(OVERLAY_SPECS.alone.matches({ group: 0 } as never)).toBe(false);
    });

    it("reads the graph sense, which is not `orphan && deadEnd`", () => {
        // `outAdj` records `relation.to` whether or not the target is an idea, so a note linking
        // only to an excluded file has an outgoing link and no neighbour here. It is alone in this
        // graph — the graph the lens is about.
        const graph = build3DGraph(buildModel([idea("inside.md", "permanent", [{ to: "excluded/out.md" }])]));
        const node = graph.nodes[0];
        expect(node.orphan).toBe(false);
        expect(node.group).toBe(-1);
        expect(graph3dStats(graph).alone).toBe(1);
    });

    it("stores the fact once", () => {
        // #513 already made `group === -1` mean exactly this. A second field would be the same
        // fact twice, free to disagree.
        const graph = build3DGraph(buildModel([idea("a.md", "seed", [])]));
        expect(Object.keys(graph.nodes[0])).not.toContain("alone");
    });
});

describe("a lens with nothing in it was already handled (#516)", () => {
    it("shows the count and refuses the click", () => {
        // Withdrawn from this issue rather than built: "Contradictions (0)", greyed out, is a
        // better answer than a message after the fact, and it shipped with #280. Guarded so it
        // cannot be lost quietly.
        expect(RENDERER).toContain('if (count === 0) chip.setAttribute("disabled", "true");');
        expect(RENDERER).toContain("(${count})");
    });

    it("builds every chip from the one list", () => {
        expect(RENDERER).toContain("OVERLAY_KINDS");
    });
});

describe("it states, and never reproaches (#516, §XII)", () => {
    it("names the lens without commentary, in both locales", () => {
        const REPROACH = [/\bstill\b/i, /\byou have\b/i, /\btodavía\b/i, /\bllevas\b/i, /\bshould\b/i, /\bdeberías\b/i];
        for (const [name, locale] of [["en", en], ["es", es]] as const) {
            const value = (locale as Record<string, string>).graph3d_overlay_alone;
            expect({ name, present: typeof value === "string" }).toEqual({ name, present: true });
            expect({ name, offends: REPROACH.some((p) => p.test(value)) }).toEqual({ name, offends: false });
        }
    });
});
