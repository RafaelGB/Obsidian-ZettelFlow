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

/**
 * **A thought written about the note** (#540) — the fourth strand.
 *
 * Thinking about a note left no trace on it: the Lab records a move only when the space was opened
 * with a framed verb, so *Think about this note* plus a sentence recorded nothing, and the note's
 * own history never learned it happened.
 *
 * Nothing needed recording. A thought already carries the note it is about, in its own frontmatter,
 * so this reads a link that has been in the data all along — which is why the strand is
 * **retroactive**: a thought written months ago appears the first time the note is opened.
 */
describe("the thoughts written about a note (#540)", () => {
    const thought = (at: number, id = "t1") => ({ id, at, path: `lab/${at}-${id}.md` });

    it("places a thought among the other events, at its own time", () => {
        const events = timelineEvents([snap(T0)], [judge(T0 + 2000)], [], [thought(T0 + 1000)]);
        expect(events.map((e) => e.kind)).toEqual(["snapshot", "thought", "judgement"]);
        expect(events[1].thought?.path).toBe(`lab/${T0 + 1000}-t1.md`);
    });

    it("carries only its own payload, and never the text", () => {
        const [event] = timelineEvents([], [], [], [thought(T0)]);
        expect(event.kind).toBe("thought");
        expect(Object.keys(event.thought ?? {}).sort()).toEqual(["at", "id", "path"]);
        expect(event.snapshot).toBeUndefined();
        expect(event.move).toBeUndefined();
    });

    it("sorts last among events that share a timestamp, so a tie renders the same every time", () => {
        const events = timelineEvents([snap(T0)], [judge(T0)], [], [thought(T0)]);
        expect(events.map((e) => e.kind)).toEqual(["snapshot", "judgement", "thought"]);
    });

    it("changes nothing for a caller that does not pass any", () => {
        // Every existing caller and every existing test is untouched — the #494 pattern.
        expect(timelineEvents([snap(T0)], [judge(T0 + 1)])).toEqual(
            timelineEvents([snap(T0)], [judge(T0 + 1)], [], [])
        );
    });
});
