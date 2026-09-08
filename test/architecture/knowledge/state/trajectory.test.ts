import { describe, it, expect } from "@jest/globals";
import { trajectory, TRAJECTORY_FRESH_DAYS, TRAJECTORY_STALE_DAYS } from "architecture/knowledge/state/trajectory";
import type { Judgement } from "architecture/knowledge/judgement";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 7, 12, 0, 0);

// hub.md has degree 4 (important); the leaves have degree 1 (just new, not tracked).
const model = buildModel([
    idea("hub.md", "permanent", [{ to: "a.md" }, { to: "b.md" }, { to: "c.md" }, { to: "d.md" }]),
    ...["a", "b", "c", "d"].map((n) => idea(`${n}.md`, "permanent", [])),
]);
const j = (at: number, path = "hub.md"): Judgement => ({ at, path, subject: "connect", origin: "derived", verdict: "confirmed" });
const hub = (history: Judgement[]) => trajectory(model, history, NOW).find((e) => e.path === "hub.md");

describe("trajectory (#364, D4) — advancing / steady / stalled, never a score", () => {
    it("marks an important idea judged recently as advancing", () => {
        expect(hub([j(NOW - 2 * DAY)])?.direction).toBe("advancing");
    });

    it("marks an important idea judged long ago as stalled", () => {
        expect(hub([j(NOW - (TRAJECTORY_STALE_DAYS + 5) * DAY)])?.direction).toBe("stalled");
    });

    it("marks an important idea never judged as stalled, with a null lastMovementAt", () => {
        const entry = hub([]);
        expect(entry?.direction).toBe("stalled");
        expect(entry?.lastMovementAt).toBeNull();
    });

    it("marks an idea judged between the windows as steady", () => {
        expect(hub([j(NOW - (TRAJECTORY_FRESH_DAYS + 5) * DAY)])?.direction).toBe("steady");
    });

    it("does not track ideas below the connectivity floor — new is not stalled", () => {
        expect(trajectory(model, [], NOW).some((e) => e.path === "a.md")).toBe(false);
    });

    it("reports the last verdict time as lastMovementAt", () => {
        const at = NOW - 3 * DAY;
        expect(hub([j(at)])?.lastMovementAt).toBe(at);
    });

    it("returns no numeric grade or score — only path, direction, lastMovementAt", () => {
        const [entry] = trajectory(model, [], NOW);
        expect(Object.keys(entry).sort()).toEqual(["direction", "lastMovementAt", "path"]);
    });

    it("orders stalled ideas before advancing ones, then by path (deterministic)", () => {
        const twoHubs = buildModel([
            idea("z.md", "permanent", [{ to: "a.md" }, { to: "b.md" }, { to: "c.md" }]),
            idea("y.md", "permanent", [{ to: "a.md" }, { to: "b.md" }, { to: "c.md" }]),
            ...["a", "b", "c"].map((n) => idea(`${n}.md`, "permanent", [])),
        ]);
        // z judged today (advancing); y never judged (stalled) — stalled must come first.
        const events = trajectory(twoHubs, [j(NOW - DAY, "z.md")], NOW);
        expect(events.map((e) => e.path)).toEqual(["y.md", "z.md"]);
    });

    it("says nothing about an empty model", () => {
        expect(trajectory(buildModel([]), [], NOW)).toEqual([]);
    });
});
