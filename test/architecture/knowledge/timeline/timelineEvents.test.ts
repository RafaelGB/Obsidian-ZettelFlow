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

/**
 * Then and now, on one line (#564, epic #558).
 *
 * The timeline held both halves of this and drew them as two unrelated rows. The join is
 * deliberately conservative: anything it cannot pair with certainty renders exactly as it did
 * before, because two rows told as one story would be worse than the two rows.
 */
describe("a claim's verdict and the change it caused are one event (#564)", () => {
    const claimJudge = (at: number, verdict: Judgement["verdict"]): Judgement =>
        judge(at, { subject: "claim:a.md", verdict });
    const said = (at: number, ...claims: string[]): Snapshot => ({ at, state: "fleeting", claims });

    it("tells a rewrite as one line, with both sentences", () => {
        const events = timelineEvents(
            [said(T0, "X"), said(T0 + 2_000, "Y")],
            [claimJudge(T0 + 4_000, "modified")]
        );
        expect(events).toHaveLength(2);
        const [, last] = events;
        expect(last.kind).toBe("return");
        expect(last.return?.said).toBe("X");
        expect(last.return?.says).toBe("Y");
        expect(last.return?.verdict).toBe("modified");
    });

    it("does not pair a verdict six minutes away from the change", () => {
        const events = timelineEvents(
            [said(T0, "X"), said(T0 + 2_000, "Y")],
            [claimJudge(T0 + 6 * 60_000, "modified")]
        );
        expect(events).toHaveLength(3);
        expect(events.map((event) => event.kind)).toEqual(["snapshot", "snapshot", "return"]);
    });

    it("does not pair a bulk edit", () => {
        // Two sentences out and two in is not a return; pairing it would invent a story.
        const events = timelineEvents(
            [said(T0, "X", "Z"), said(T0 + 2_000, "Y", "W")],
            [claimJudge(T0 + 3_000, "modified")]
        );
        expect(events).toHaveLength(3);
        expect(events[2].return?.says).toBeUndefined();
    });

    it("draws the milestone the timeline has never drawn", () => {
        // You looked again and it still says the same. Nothing changed, and that is the point.
        const events = timelineEvents([said(T0, "X")], [claimJudge(T0 + 1_000, "confirmed")]);
        expect(events).toHaveLength(2);
        expect(events[1].kind).toBe("return");
        expect(events[1].return?.said).toBe("X");
        expect(events[1].return?.says).toBeUndefined();
    });

    it("names the thought a withdrawn sentence became", () => {
        const thought = { id: "t1", at: T0 + 1_500, path: "_ZettelFlow/lab/1700-a.md" };
        const events = timelineEvents([said(T0, "X")], [claimJudge(T0 + 2_000, "rejected")], [], [thought]);
        expect(events).toHaveLength(2);
        expect(events[1].return?.verdict).toBe("rejected");
        expect(events[1].return?.said).toBe("X");
        expect(events[1].return?.thought?.path).toBe(thought.path);
    });

    it("leaves a distant thought as a row of its own", () => {
        const thought = { id: "t1", at: T0 + 10 * 60_000, path: "_ZettelFlow/lab/1700-a.md" };
        const events = timelineEvents([said(T0, "X")], [claimJudge(T0 + 2_000, "rejected")], [], [thought]);
        expect(events).toHaveLength(3);
        expect(events.map((event) => event.kind)).toEqual(["snapshot", "return", "thought"]);
    });

    it("still says what happened with no snapshots at all", () => {
        const events = timelineEvents([], [claimJudge(T0, "confirmed"), claimJudge(T0 + 1_000, "rejected")]);
        expect(events.map((event) => event.kind)).toEqual(["return", "return"]);
        for (const event of events) expect(event.return?.said).toBeUndefined();
    });

    it("leaves a verdict about anything else alone", () => {
        const events = timelineEvents([said(T0, "X")], [judge(T0 + 1_000, { subject: "gap:b.md" })]);
        expect(events.map((event) => event.kind)).toEqual(["snapshot", "judgement"]);
    });

    it("leaves a claim change nobody ruled on as a lone snapshot", () => {
        const events = timelineEvents([said(T0, "X"), said(T0 + 1_000, "Y")], []);
        expect(events.map((event) => event.kind)).toEqual(["snapshot", "snapshot"]);
    });
});

/**
 * A note you promoted, told as one line (#581).
 *
 * The same join as a claim's return, with two extra refusals: the snapshot has to *be* the state
 * the verdict names, and a snapshot where the claims moved too is two things happening.
 */
describe("a promotion and the state change it caused are one event (#581)", () => {
    const at = (moment: number, state: string, ...claims: string[]): Snapshot => ({ at: moment, state, claims });
    const promoted = (moment: number, to: string): Judgement =>
        judge(moment, { subject: `state:${to}`, origin: "derived", verdict: "accepted" });

    it("tells the verdict and the state change as one row", () => {
        const events = timelineEvents(
            [at(T0, "fleeting"), at(T0 + 1_000, "literature")],
            [promoted(T0 + 2_000, "literature")]
        );
        expect(events).toHaveLength(2);
        expect(events[1].kind).toBe("promotion");
        expect(events[1].promotion?.to).toBe("literature");
        expect(events[1].promotion?.judgement.origin).toBe("derived");
    });

    it("does not pair a verdict ten minutes away", () => {
        const events = timelineEvents(
            [at(T0, "fleeting"), at(T0 + 1_000, "literature")],
            [promoted(T0 + 10 * 60_000, "literature")]
        );
        expect(events).toHaveLength(3);
        expect(events.map((event) => event.kind)).toEqual(["snapshot", "snapshot", "promotion"]);
    });

    it("does not pair a snapshot that is not the state it names", () => {
        const events = timelineEvents(
            [at(T0, "fleeting"), at(T0 + 1_000, "literature")],
            [promoted(T0 + 2_000, "permanent")]
        );
        expect(events).toHaveLength(3);
        expect(events[2].promotion?.to).toBe("permanent");
    });

    it("stays two rows when the claims moved too", () => {
        // Two things happened. Telling them as one would be the fabrication the join exists to avoid.
        const events = timelineEvents(
            [at(T0, "fleeting", "X"), at(T0 + 1_000, "literature", "Y")],
            [promoted(T0 + 2_000, "literature")]
        );
        expect(events).toHaveLength(3);
    });

    it("says what happened even with no snapshots at all", () => {
        const events = timelineEvents([], [promoted(T0, "literature")]);
        expect(events.map((event) => event.kind)).toEqual(["promotion"]);
        expect(events[0].promotion?.to).toBe("literature");
    });

    it("leaves a claim's return exactly as #564 built it", () => {
        const events = timelineEvents(
            [at(T0, "fleeting", "X"), at(T0 + 1_000, "fleeting", "Y")],
            [judge(T0 + 2_000, { subject: "claim:a.md", verdict: "modified" })]
        );
        expect(events).toHaveLength(2);
        expect(events[1].return?.said).toBe("X");
        expect(events[1].return?.says).toBe("Y");
    });
});
