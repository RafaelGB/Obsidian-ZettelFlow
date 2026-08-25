import { describe, it, expect } from "@jest/globals";
import { buildHome } from "architecture/knowledge/home/home";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

const NOW = 1_000_000_000_000;
const DAY = 86_400_000;

// hub: a stale hub (degree 5, modified 40d ago) → reviewDue + mainConcepts + nextSession. It co-cites
// n1..n5 → discoveries. recent1/recent2: created in the 7-day window → newIdeas. old: outside it.
const model = buildModel([
    idea("hub.md", "permanent", [{ to: "n1.md" }, { to: "n2.md" }, { to: "n3.md" }, { to: "n4.md" }, { to: "n5.md" }], {
        created: NOW - 40 * DAY,
        modified: NOW - 40 * DAY,
    }),
    idea("n1.md", "permanent", []),
    idea("n2.md", "permanent", []),
    idea("n3.md", "permanent", []),
    idea("n4.md", "permanent", []),
    idea("n5.md", "permanent", []),
    idea("recent1.md", "fleeting", [], { created: NOW - 1 * DAY, modified: NOW - 1 * DAY }),
    idea("recent2.md", "fleeting", [], { created: NOW - 2 * DAY, modified: NOW - 2 * DAY }),
    idea("old.md", "fleeting", [], { created: NOW - 30 * DAY, modified: NOW - 30 * DAY }),
]);

describe("buildHome (#172, FR-1..FR-6, AC-1)", () => {
    it("composes the narrative widgets from live model + journal state", () => {
        expect(buildHome(model, { thinkingDays: 42, now: NOW })).toEqual({
            thinkingDays: 42,
            newIdeas: ["recent1.md", "recent2.md"],
            mainConcepts: ["hub.md", "n1.md", "n2.md", "n3.md", "n4.md"],
            reviewDue: ["hub.md"],
            suggestedConnections: [
                { a: "n1.md", b: "n2.md" },
                { a: "n1.md", b: "n3.md" },
                { a: "n1.md", b: "n4.md" },
            ],
            nextSession: { path: "hub.md", reason: "develop-hub" },
            fleetingCount: 3,
            fleetingReady: ["recent1.md", "recent2.md", "old.md"],
        });
    });

    it("yields a well-defined empty home (nextSession null, thinkingDays echoed) for an empty model", () => {
        expect(buildHome(buildModel([]), { thinkingDays: 42, now: NOW })).toEqual({
            thinkingDays: 42,
            newIdeas: [],
            mainConcepts: [],
            reviewDue: [],
            suggestedConnections: [],
            nextSession: null,
            fleetingCount: 0,
            fleetingReady: [],
        });
    });

    it("is deterministic and read-only", () => {
        const before = model.size();
        expect(buildHome(model, { thinkingDays: 42, now: NOW })).toEqual(buildHome(model, { thinkingDays: 42, now: NOW }));
        expect(model.size()).toBe(before);
    });
});
