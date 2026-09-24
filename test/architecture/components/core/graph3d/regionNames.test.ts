import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { build3DGraph } from "architecture/knowledge/map/graph3d";
import { idea, buildModel } from "../../../../actions/knowledge/support/knowledgeFixture";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const RENDERER = read("src/architecture/components/core/graph3d/Graph3DRenderer.ts");

/**
 * **A region has a name you can read** (#514, epic #512).
 *
 * > "no se distinguen nada bien ni tienen nombre como tal"
 *
 * The largest structure on screen was the only thing without a label. `SpriteText` was already
 * loaded and already mounted — `updateProximityLabels()` puts names on nearby notes — so the
 * regions were the one thing the renderer drew and never named.
 *
 * Jest runs in `node`, so a WebGL scene cannot be mounted: the rendering promises are asserted by
 * reading the renderer, which is how every view in this repo is verified.
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

describe("the node knows which region it is in (#514)", () => {
    it("carries the region's name, not just an index", () => {
        const graph = build3DGraph(
            buildModel([
                idea("notes/centre.md", "permanent", [{ to: "notes/spoke.md" }]),
                idea("notes/spoke.md", "seed", []),
            ])
        );
        expect(graph.nodes.map((node) => node.region)).toEqual(["centre", "centre"]);
    });

    it("leaves it empty for a note that is alone", () => {
        const graph = build3DGraph(buildModel([idea("alone.md", "seed", [])]));
        expect(graph.nodes[0]).toMatchObject({ group: -1, region: "" });
    });

    it("survives a cap, because it rides on the node", () => {
        // The alternative — a `regions` field on Graph3DData — would have to be threaded through
        // filterGraph3D and graph3dUpToTime, and would go stale in both.
        const source = read("src/architecture/knowledge/map/graph3d.ts");
        expect(source).not.toContain("regions:");
        expect(source).toContain("region: ");
    });
});

describe("the scene says the name (#514)", () => {
    it("builds the region labels in the same pass as the hulls", () => {
        const hulls = code(RENDERER).slice(code(RENDERER).indexOf("private rebuildHulls"));
        expect(hulls.slice(0, hulls.indexOf("private disposeHulls"))).toContain("regionLabels");
    });

    it("and a hull cannot be dropped without its name going too", () => {
        // One lifecycle, and since #520 a single helper: `dropHull` removes the mesh and the
        // label together, and `disposeHulls` is that helper over every region. A second lifecycle
        // for the labels is how one of them ends up orphaned in the scene.
        const drop = code(RENDERER).slice(code(RENDERER).indexOf("private dropHull"));
        const body = drop.slice(0, drop.indexOf("private disposeHulls"));
        expect(body).toContain("scene.remove(mesh)");
        expect(body).toContain("this.regionLabels.delete(group)");
        expect(code(RENDERER)).toMatch(/private disposeHulls[\s\S]{0,200}this\.dropHull\(scene, group\)/);
        expect(code(RENDERER)).not.toMatch(/private\s+disposeRegionLabels/);
    });

    it("creates none in lite mode", () => {
        expect(code(RENDERER)).toMatch(/private rebuildHulls\(\): void \{[\s\S]{0,200}this\.lite/);
    });
});

describe("the legend says the name (#514)", () => {
    it("lists the regions that are on screen, with their size", () => {
        // Counted from `displayed.nodes`, so after a cap or a time cursor the legend reports what
        // you are looking at rather than what the model holds.
        const legend = code(RENDERER).slice(code(RENDERER).indexOf("private renderLegend"));
        expect(legend).toContain("displayed.nodes");
        expect(legend).toContain("graph3d_legend_region_size");
        expect(legend).toContain("graph3d_legend_alone");
    });

    it("no longer offers one row that says nothing", () => {
        expect(RENDERER).not.toContain("graph3d_legend_cluster");
        for (const locale of ["en", "es"]) {
            expect(read(`src/architecture/lang/locale/${locale}.ts`)).not.toContain("graph3d_legend_cluster");
        }
    });

    it("calls them regions, in the code and in both locales", () => {
        // A type that says "cluster" while the product says region is how the next reader gets it
        // wrong. The word that started this epic was *regiones*.
        expect(code(RENDERER)).not.toContain('"cluster"');
        for (const [name, locale] of [["en", en], ["es", es]] as const) {
            const value = (locale as Record<string, string>).graph3d_color_neighbourhood;
            expect({ name, value: typeof value }).toEqual({ name, value: "string" });
        }
    });

    it("keeps both locales complete for every key it added", () => {
        const added = [
            "graph3d_color_neighbourhood",
            "graph3d_legend_neighbourhoods",
            "graph3d_legend_region_size",
            "graph3d_legend_alone",
        ];
        for (const key of added) {
            expect({ key, en: key in en, es: key in es }).toEqual({ key, en: true, es: true });
        }
    });
});
