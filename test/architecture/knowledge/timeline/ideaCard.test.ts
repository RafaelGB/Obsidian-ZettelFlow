import { describe, it, expect } from "@jest/globals";
import { buildIdeaCard } from "architecture/knowledge/timeline/ideaCard";
import { timelineEvents } from "architecture/knowledge/timeline/timelineEvents";
import type { Snapshot } from "architecture/knowledge/timeline/recordSnapshot";
import type { Judgement } from "architecture/knowledge/judgement";

const DAY = 86_400_000;
const t0 = Date.UTC(2026, 0, 1);
const t1 = t0 + DAY;
const t2 = t0 + 2 * DAY;
const PATH = "ideas/deep/atomicity.md";

const snap = (at: number, state: string, claims: string[]): Snapshot => ({ at, state, claims });
const jud = (at: number, verdict: Judgement["verdict"]): Judgement => ({
    at, path: PATH, subject: "advance", origin: "ai", verdict,
});

/** B4 (#387) — the pure idea-card builder. Reads only shipped shapes, never mutates, writes nothing. */
describe("buildIdeaCard (#387)", () => {
    const snapshots = [snap(t0, "seedling", ["a"]), snap(t1, "budding", ["a", "b"]), snap(t2, "evergreen", ["a", "b", "c"])];
    const judgements = [jud(t0, "accepted"), jud(t1, "modified"), jud(t2, "confirmed")];
    const events = timelineEvents(snapshots, judgements);

    it("summarises the before→after state and claim delta", () => {
        const card = buildIdeaCard({ path: PATH, events, linksNow: 7, direction: "advancing" })!;
        expect(card.title).toBe("atomicity");
        expect(card.firstState).toBe("seedling");
        expect(card.currentState).toBe("evergreen");
        expect(card.stateChanged).toBe(true);
        expect(card.claimsFirst).toBe(1);
        expect(card.claimsCurrent).toBe(3);
        expect(card.claimsGained).toBe(2);
        expect(card.linksNow).toBe(7);
    });

    it("carries the judgement milestones in time order", () => {
        const card = buildIdeaCard({ path: PATH, events, linksNow: 0 })!;
        expect(card.milestoneCount).toBe(3);
        expect(card.milestones.map((m) => m.verdict)).toEqual(["accepted", "modified", "confirmed"]);
    });

    it("reads the trajectory direction, or null when none is supplied", () => {
        expect(buildIdeaCard({ path: PATH, events, linksNow: 0, direction: "advancing" })!.direction).toBe("advancing");
        expect(buildIdeaCard({ path: PATH, events, linksNow: 0 })!.direction).toBeNull();
    });

    it("computes elapsed time from first to last event", () => {
        const card = buildIdeaCard({ path: PATH, events, linksNow: 0 })!;
        expect(card.elapsedMs).toBe(t2 - t0);
        expect(card.elapsedDays).toBe(2);
    });

    it("returns null when there are no events", () => {
        expect(buildIdeaCard({ path: PATH, events: [], linksNow: 3 })).toBeNull();
    });

    it("handles a single snapshot: no state change, no claims gained, zero elapsed", () => {
        const one = timelineEvents([snap(t0, "seedling", ["a"])], []);
        const card = buildIdeaCard({ path: PATH, events: one, linksNow: 1 })!;
        expect(card.stateChanged).toBe(false);
        expect(card.claimsGained).toBe(0);
        expect(card.milestoneCount).toBe(0);
        expect(card.elapsedMs).toBe(0);
    });

    it("never mutates its input (frozen arrays are safe)", () => {
        const frozen = Object.freeze(timelineEvents(snapshots, judgements).map((e) => Object.freeze(e)));
        expect(() => buildIdeaCard({ path: PATH, events: frozen, linksNow: 7 })).not.toThrow();
        expect(frozen).toHaveLength(6);
    });
});
