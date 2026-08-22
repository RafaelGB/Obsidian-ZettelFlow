import { describe, it, expect } from "@jest/globals";
import { classifyHealth } from "architecture/knowledge/state";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

/**
 * Health is now a projection over the KnowledgeModel's typed edges (#274): orphan = no OUTGOING edge,
 * dead-end = no INCOMING edge, where edges include raw wikilinks AND semantic relations. This changes
 * displayed numbers vs the old raw-`resolvedLinks` classifier — the delta case below records that.
 */
describe("classifyHealth over the knowledge model (#274)", () => {
    it("flags no orphans/dead-ends for a mutually linked pair (AC-1)", () => {
        const model = buildModel([idea("a.md", "permanent", [{ to: "b.md" }]), idea("b.md", "permanent", [{ to: "a.md" }])]);
        const result = classifyHealth(model);
        expect(result.orphans).toHaveLength(0);
        expect(result.deadEnds).toHaveLength(0);
        expect(result.totalScanned).toBe(2);
    });

    it("counts SEMANTIC relations as connections — the intended delta (AC-2)", () => {
        // a↔b connected only by `supports` (a semantic relation, not a raw wikilink). The old
        // raw-link classifier flagged BOTH as orphan+dead-end; the model-based one flags NEITHER.
        const model = buildModel([
            idea("a.md", "permanent", [{ to: "b.md", type: "supports" }]),
            idea("b.md", "permanent", [{ to: "a.md", type: "supports" }]),
        ]);
        const result = classifyHealth(model);
        expect(result.orphans).toHaveLength(0);
        expect(result.deadEnds).toHaveLength(0);
    });

    it("is identical to the old behaviour for a plain-wikilink-only vault (FR-9 parity)", () => {
        const model = buildModel([idea("a.md", "permanent", [{ to: "b.md", type: "link" }]), idea("b.md", "permanent", [])]);
        const result = classifyHealth(model);
        // a: has outgoing, no incoming → dead-end; b: has incoming, no outgoing → orphan.
        expect(result.orphans.map((n) => n.path)).toEqual(["b.md"]);
        expect(result.deadEnds.map((n) => n.path)).toEqual(["a.md"]);
    });

    it("classifies directed edges under the frozen wording (AC-3)", () => {
        const model = buildModel([
            idea("hub.md", "permanent", [{ to: "leaf.md" }]),
            idea("leaf.md", "permanent", []),
            idea("island.md", "permanent", []),
        ]);
        const result = classifyHealth(model);
        expect(result.orphans.map((n) => n.path).sort()).toEqual(["island.md", "leaf.md"]);
        expect(result.deadEnds.map((n) => n.path).sort()).toEqual(["hub.md", "island.md"]);
    });

    it("a self-relation-only note is both an orphan and a dead-end (AC-4)", () => {
        const model = buildModel([idea("self.md", "permanent", [{ to: "self.md" }])]);
        const result = classifyHealth(model);
        expect(result.orphans.map((n) => n.path)).toContain("self.md");
        expect(result.deadEnds.map((n) => n.path)).toContain("self.md");
    });

    it("derives the basename and scans the whole model (AC-5)", () => {
        expect(classifyHealth(buildModel([])).totalScanned).toBe(0);
        const model = buildModel([idea("folder/note.md", "permanent", [])]);
        const result = classifyHealth(model);
        expect(result.orphans[0].basename).toBe("note");
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
});
