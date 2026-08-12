import { describe, it, expect } from "@jest/globals";
import { buildKnowledgeMap } from "architecture/knowledge/map/knowledgeMap";
import { hubs } from "architecture/knowledge/query/queries";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

// Threshold 4. Degrees: h1=7, h2=6, h3=4 (member-less, hub-only edges). shDeg(2)/shStr(3)/m*(1)/u(0) non-hubs.
// shDeg → h1 & h2 one-way ⇒ degree tie-break → h1. shStr ↔ h2 (strength 2) beats one-way h1. u isolated.
const model = buildModel([
    idea("h1.md", "permanent", [{ to: "h3.md" }]),
    idea("h2.md", "permanent", [{ to: "shStr.md" }, { to: "h3.md" }]),
    idea("h3.md", "permanent", [{ to: "h1.md" }, { to: "h2.md" }]),
    idea("m1.md", "permanent", [{ to: "h1.md" }]),
    idea("m2.md", "permanent", [{ to: "h1.md" }]),
    idea("m3.md", "permanent", [{ to: "h2.md" }]),
    idea("m4.md", "permanent", [{ to: "h1.md" }]),
    idea("shDeg.md", "permanent", [{ to: "h1.md" }, { to: "h2.md" }]),
    idea("shStr.md", "permanent", [{ to: "h1.md" }, { to: "h2.md" }]),
    idea("u.md", "permanent", []),
]);

describe("buildKnowledgeMap (#164, AC-1)", () => {
    it("detects hubs and clusters non-hub notes by strongest adjacent hub", () => {
        expect(buildKnowledgeMap(model, { hubThreshold: 4 })).toEqual({
            clusters: [
                { hub: "h1.md", degree: 7, members: ["m1.md", "m2.md", "m4.md", "shDeg.md"] },
                { hub: "h2.md", degree: 6, members: ["m3.md", "shStr.md"] },
                { hub: "h3.md", degree: 4, members: [] },
            ],
            unclustered: ["u.md"],
        });
    });

    it("uses exactly the hubs() query for detection", () => {
        const map = buildKnowledgeMap(model, { hubThreshold: 4 });
        expect(new Set(map.clusters.map((c) => c.hub))).toEqual(new Set(hubs(model, 4).map((h) => h.path)));
    });

    it("is deterministic, read-only, and empty for an empty model", () => {
        expect(buildKnowledgeMap(model, { hubThreshold: 4 })).toEqual(buildKnowledgeMap(model, { hubThreshold: 4 }));
        expect(model.size()).toBe(10);
        expect(buildKnowledgeMap(buildModel([]))).toEqual({ clusters: [], unclustered: [] });
    });
});
