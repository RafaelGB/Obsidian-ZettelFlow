import { describe, it, expect } from "@jest/globals";
import { buildKnowledgeDashboard } from "architecture/knowledge/dashboard/knowledgeDashboard";
import { gapTally } from "architecture/knowledge/discovery/discoveries";
import { gapVerdict } from "architecture/knowledge/judgement/gapVerdict";
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
                        // Three is this fixture's true total, not the display limit #530
                        // removed: (a, b) co-cited by s, plus (f1, s) and (f2, s), each pair
                        // coupled by the target they both link. A correct expectation that
                        // happens to equal the old cap -- do not "fix" it.
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

describe("the connections metric counts every gap (#530, FR-5, AC-3)", () => {
    // One hub citing five unlinked notes co-cites ten pairs, so the true total is ten. Before this
    // issue the metric read `findDiscoveries(model).length` with no limit -- three by default -- so
    // the panel could never report more than three gaps however many a vault had.
    const manyGaps = buildModel([
        idea("hub.md", "permanent", [
            { to: "a.md" },
            { to: "b.md" },
            { to: "c.md" },
            { to: "d.md" },
            { to: "e.md" },
        ]),
        idea("a.md", "permanent", []),
        idea("b.md", "permanent", []),
        idea("c.md", "permanent", []),
        idea("d.md", "permanent", []),
        idea("e.md", "permanent", []),
    ]);

    const today = () => buildKnowledgeDashboard(manyGaps).panels.find((panel) => panel.key === "today");

    it("reports the true total, not the display limit", () => {
        expect(gapTally(manyGaps).size).toBe(10);
        expect(today()?.metrics.find((metric) => metric.key === "connections")).toEqual({
            key: "connections",
            count: 10,
        });
    });

    it("hands that same total to the recommendation", () => {
        expect(today()?.recommendation).toEqual({ token: "make-connections", count: 10 });
    });
});

describe("the connections metric counts only pairs of notes that exist (#538, AC-3)", () => {
    // The same ten-gap hub, plus one note whose two links are broken. Those two broken targets used
    // to tally as an eleventh "gap", so the panel proposed a connection between two notes that were
    // never written -- and the recommendation was driven by that inflated count.
    const withBroken = buildModel([
        idea("hub.md", "permanent", [
            { to: "a.md" },
            { to: "b.md" },
            { to: "c.md" },
            { to: "d.md" },
            { to: "e.md" },
        ]),
        idea("a.md", "permanent", []),
        idea("b.md", "permanent", []),
        idea("c.md", "permanent", []),
        idea("d.md", "permanent", []),
        idea("e.md", "permanent", []),
        idea("broken.md", "permanent", [{ to: "Not a note yet" }, { to: "Also not a note" }]),
    ]);

    const connectionsOf = (target: ReturnType<typeof buildModel>) =>
        buildKnowledgeDashboard(target)
            .panels.find((panel) => panel.key === "today")
            ?.metrics.find((metric) => metric.key === "connections");

    it("drops by exactly the dangling pair the broken links used to add", () => {
        expect(connectionsOf(withBroken)).toEqual({ key: "connections", count: 10 });
        expect(gapTally(withBroken).size).toBe(10);
    });

    it("reads the same as the vault without those broken links at all", () => {
        const withoutBroken = buildModel([
            idea("hub.md", "permanent", [
                { to: "a.md" },
                { to: "b.md" },
                { to: "c.md" },
                { to: "d.md" },
                { to: "e.md" },
            ]),
            idea("a.md", "permanent", []),
            idea("b.md", "permanent", []),
            idea("c.md", "permanent", []),
            idea("d.md", "permanent", []),
            idea("e.md", "permanent", []),
        ]);
        expect(connectionsOf(withBroken)).toEqual(connectionsOf(withoutBroken));
    });
});

describe("the connections metric counts what you have not ruled out (#534, FR-2, AC-1)", () => {
    const tenGaps = buildModel([
        idea("hub.md", "permanent", [
            { to: "a.md" },
            { to: "b.md" },
            { to: "c.md" },
            { to: "d.md" },
            { to: "e.md" },
        ]),
        idea("a.md", "permanent", []),
        idea("b.md", "permanent", []),
        idea("c.md", "permanent", []),
        idea("d.md", "permanent", []),
        idea("e.md", "permanent", []),
    ]);
    const NOW = 1_700_000_000_000;
    const connections = (history?: { at: number }[]) =>
        buildKnowledgeDashboard(tenGaps, history as never)
            .panels.find((panel) => panel.key === "today")
            ?.metrics.find((metric) => metric.key === "connections")?.count;

    it("drops by the verdicts you gave", () => {
        expect(connections([])).toBe(10);
        expect(connections([{ at: NOW, ...gapVerdict("a.md", "b.md") }])).toBe(9);
        expect(
            connections([
                { at: NOW, ...gapVerdict("a.md", "b.md") },
                { at: NOW + 1, ...gapVerdict("c.md", "d.md") },
            ])
        ).toBe(8);
    });

    it("hands the smaller number to the recommendation, so it stops asking too", () => {
        const today = buildKnowledgeDashboard(tenGaps, [
            { at: NOW, ...gapVerdict("a.md", "b.md") },
        ]).panels.find((panel) => panel.key === "today");
        expect(today?.recommendation).toEqual({ token: "make-connections", count: 9 });
    });

    it("reads the same as before when no record is passed (#530's expectation, unchanged)", () => {
        expect(connections()).toBe(10);
    });
});
