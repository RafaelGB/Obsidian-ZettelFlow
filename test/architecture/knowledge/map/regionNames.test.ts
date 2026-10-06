import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { build3DGraph } from "architecture/knowledge/map/graph3d";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/**
 * **A region has a name you can read** (#514, epic #512) — and, since #697, one you can change.
 *
 * The node carries the names it belongs to: its connected region, its neighbourhood, and the
 * neighbourhood's hub as a path, which is the key a renamed region is remembered by. How the graph
 * draws the names is the renderer's business (`GraphCanvas`, the overview); this is the data.
 */
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

    it("carries its neighbourhood's hub as a path, the key a rename is kept under (#697)", () => {
        const graph = build3DGraph(
            buildModel([
                idea("notes/centre.md", "permanent", [{ to: "notes/spoke.md" }]),
                idea("notes/spoke.md", "seed", []),
            ])
        );
        expect(graph.nodes.map((node) => node.communityHub)).toEqual(["notes/centre.md", "notes/centre.md"]);
        expect(graph.nodes.map((node) => node.communityName)).toEqual(["centre", "centre"]);
    });

    it("leaves it empty for a note that is alone", () => {
        const graph = build3DGraph(buildModel([idea("alone.md", "seed", [])]));
        expect(graph.nodes[0]).toMatchObject({ group: -1, region: "", communityHub: "" });
    });

    it("rides on the node, so no filter has to thread it through", () => {
        // The alternative — a `regions` field on Graph3DData — would have to be threaded through
        // filterGraph3D and graph3dUpToTime, and would go stale in both.
        const source = read("src/architecture/knowledge/map/graph3d.ts");
        expect(source).not.toContain("regions:");
        expect(source).toContain("region: ");
    });
});
