import { describe, it, expect } from "@jest/globals";
import { buildKnowledgeDashboard } from "architecture/knowledge/dashboard/knowledgeDashboard";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

// 11 notes: iso is isolated (orphaned); d has a dangling out-edge (unresolved); f1/f2 are fleeting
// (process); x→contradicts→y; q1→question→q2 (open question); s co-cites a,b (a discovery).
const model = buildModel([
    idea("s.md", "permanent", [{ to: "a.md" }, { to: "b.md" }]),
    idea("a.md", "permanent", []),
    idea("b.md", "permanent", []),
    idea("x.md", "permanent", [{ to: "y.md", type: "contradicts" }]),
    idea("y.md", "permanent", []),
    idea("q1.md", "permanent", [{ to: "q2.md", type: "question" }]),
    idea("q2.md", "permanent", []),
    idea("d.md", "permanent", [{ to: "missing.md" }]),
    idea("iso.md", "permanent", []),
    idea("f1.md", "fleeting", [{ to: "a.md" }]),
    idea("f2.md", "fleeting", [{ to: "b.md" }]),
]);

describe("buildKnowledgeDashboard (#171, FR-1/FR-3, AC-1)", () => {
    it("aggregates the three ops-console panels, each with a recommendation", () => {
        expect(buildKnowledgeDashboard(model)).toEqual({
            panels: [
                {
                    key: "connectivity",
                    metrics: [
                        { key: "connected", count: 10, percent: 91 },
                        { key: "orphaned", count: 1, percent: 9 },
                        { key: "unresolved", count: 1, percent: 9 },
                    ],
                    recommendation: { token: "connect-orphans", count: 1 },
                },
                {
                    key: "debt",
                    metrics: [{ key: "score", count: 27, band: "low" }],
                    recommendation: { token: "reduce-debt", count: 27 },
                },
                {
                    key: "today",
                    metrics: [
                        { key: "process", count: 2 },
                        { key: "contradictions", count: 1 },
                        { key: "connections", count: 3 },
                        { key: "questions", count: 1 },
                    ],
                    recommendation: { token: "resolve-contradictions", count: 1 },
                },
            ],
        });
    });

    it("emits three panels, and every panel carries a recommendation (AC-2)", () => {
        const dashboard = buildKnowledgeDashboard(model);
        expect(dashboard.panels.map((panel) => panel.key)).toEqual(["connectivity", "debt", "today"]);
        expect(dashboard.panels.every((panel) => panel.recommendation != null)).toBe(true);
    });

    it("yields a well-defined zeroed dashboard (still recommending) for an empty model (FR-5)", () => {
        expect(buildKnowledgeDashboard(buildModel([]))).toEqual({
            panels: [
                {
                    key: "connectivity",
                    metrics: [
                        { key: "connected", count: 0, percent: 0 },
                        { key: "orphaned", count: 0, percent: 0 },
                        { key: "unresolved", count: 0, percent: 0 },
                    ],
                    recommendation: { token: "all-connected", count: 0 },
                },
                {
                    key: "debt",
                    metrics: [{ key: "score", count: 0, band: "low" }],
                    recommendation: { token: "debt-clear", count: 0 },
                },
                {
                    key: "today",
                    metrics: [
                        { key: "process", count: 0 },
                        { key: "contradictions", count: 0 },
                        { key: "connections", count: 0 },
                        { key: "questions", count: 0 },
                    ],
                    recommendation: { token: "all-clear", count: 0 },
                },
            ],
        });
    });

    it("is deterministic, read-only, and never throws on a degenerate graph (AC-4)", () => {
        const degenerate = buildModel([
            idea("self.md", "permanent", [{ to: "self.md" }, { to: "gone.md" }]),
        ]);
        const before = degenerate.size();
        expect(buildKnowledgeDashboard(degenerate)).toEqual(buildKnowledgeDashboard(degenerate));
        expect(degenerate.size()).toBe(before);
        expect(() => buildKnowledgeDashboard(degenerate)).not.toThrow();
    });
});
