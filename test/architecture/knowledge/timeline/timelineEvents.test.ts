import { describe, it, expect } from "@jest/globals";
import { timelineEvents } from "architecture/knowledge/timeline/timelineEvents";
import type { Snapshot } from "architecture/knowledge/timeline/recordSnapshot";
import type { Judgement } from "architecture/knowledge/judgement";

const T0 = Date.UTC(2026, 8, 1, 9, 0, 0);
const snap = (at: number, state = "fleeting"): Snapshot => ({ at, state, claims: [] });
const judge = (at: number, over: Partial<Judgement> = {}): Judgement => ({
    at,
    path: "a.md",
    subject: "connect",
    origin: "derived",
    verdict: "confirmed",
    ...over,
});

describe("timelineEvents (#362, D2) — the living timeline", () => {
    it("merges N snapshots and M judgements into N+M time-ordered events", () => {
        const events = timelineEvents([snap(T0), snap(T0 + 2000)], [judge(T0 + 1000), judge(T0 + 3000)]);
        expect(events.length).toBe(4);
        expect(events.map((e) => e.at)).toEqual([T0, T0 + 1000, T0 + 2000, T0 + 3000]);
        expect(events.map((e) => e.kind)).toEqual(["snapshot", "judgement", "snapshot", "judgement"]);
    });

    it("tags each event with its kind and carries only its own payload", () => {
        const [snapshotEvent] = timelineEvents([snap(T0)], []);
        expect(snapshotEvent.kind).toBe("snapshot");
        expect(snapshotEvent.snapshot?.at).toBe(T0);
        expect(snapshotEvent.judgement).toBeUndefined();

        const [judgementEvent] = timelineEvents([], [judge(T0, { note: "because X", confidence: "high" })]);
        expect(judgementEvent.kind).toBe("judgement");
        expect(judgementEvent.judgement?.note).toBe("because X");
        expect(judgementEvent.snapshot).toBeUndefined();
    });

    it("orders a snapshot before a judgement that share a timestamp (stable tie-break)", () => {
        expect(timelineEvents([snap(T0)], [judge(T0)]).map((e) => e.kind)).toEqual(["snapshot", "judgement"]);
    });

    it("returns snapshots only when there are no judgements — today's timeline, unchanged", () => {
        const events = timelineEvents([snap(T0), snap(T0 + 1)], []);
        expect(events.length).toBe(2);
        expect(events.every((e) => e.kind === "snapshot")).toBe(true);
    });

    it("returns an empty stream for empty inputs", () => {
        expect(timelineEvents([], [])).toEqual([]);
    });
});
