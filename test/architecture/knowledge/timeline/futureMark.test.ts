import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { timelineEvents, type HorizonEvent } from "architecture/knowledge/timeline/timelineEvents";
import { buildIdeaCard } from "architecture/knowledge/timeline/ideaCard";
import type { Snapshot } from "architecture/knowledge/timeline/recordSnapshot";
import type { Judgement } from "architecture/knowledge/judgement";

// test/architecture/knowledge/timeline → 4 ups → repo root
const ROOT = join(__dirname, "..", "..", "..", "..");
const RENDERER = readFileSync(
    join(ROOT, "src/architecture/components/core/timeline/EvolutionTimelineRenderer.ts"),
    "utf8"
);

const T0 = Date.UTC(2026, 8, 1, 9, 0, 0);
const DAY = 86_400_000;

const snap = (at: number, state = "fleeting", claims: string[] = []): Snapshot => ({ at, state, claims });
const judge = (at: number, over: Partial<Judgement> = {}): Judgement => ({
    at,
    path: "a.md",
    subject: "connect",
    origin: "derived",
    verdict: "confirmed",
    ...over,
});
const horizon = (at: number): HorizonEvent => ({ expectation: "two teams stop waiting", at });

/**
 * One mark in the future (#572, epic #560).
 *
 * Every event this axis has ever drawn is in the past. A horizon is the first exception — and the
 * rule it has to obey is that **nothing in the past moves** to make room for it.
 */
describe("a day you expect to know by (#572)", () => {
    it("adds nothing at all when there is no wager", () => {
        const withNothing = timelineEvents([snap(T0)], [judge(T0 + 1_000)]);
        const explicit = timelineEvents([snap(T0)], [judge(T0 + 1_000)], [], [], undefined);
        expect(explicit).toEqual(withNothing);
        expect(withNothing.some((event) => event.kind === "horizon")).toBe(false);
    });

    it("draws one mark, carrying the day and what you expect", () => {
        const events = timelineEvents([snap(T0)], [], [], [], horizon(T0 + 30 * DAY));
        expect(events).toHaveLength(2);
        expect(events[1].kind).toBe("horizon");
        expect(events[1].horizon).toEqual(horizon(T0 + 30 * DAY));
    });

    it("moves nothing in the past", () => {
        // The honest assertion, and the whole of AC-6: this axis is an **ordered list**, not a
        // scaled one — nothing is positioned by time, so a horizon two years out cannot squeeze a
        // decade into the margin. What it must not do is reorder or rewrite what happened.
        const snapshots = [snap(T0, "fleeting", ["X"]), snap(T0 + 2_000, "fleeting", ["Y"])];
        const judgements = [judge(T0 + 3_000, { subject: "claim:a.md", verdict: "modified" })];
        const without = timelineEvents(snapshots, judgements);
        for (const at of [T0 - DAY, T0 + 1_000, T0 + 10_000, T0 + 3_650 * DAY]) {
            const withMark = timelineEvents(snapshots, judgements, [], [], horizon(at));
            expect({ at, past: withMark.filter((event) => event.kind !== "horizon") }).toEqual({
                at,
                past: without,
            });
        }
    });

    it("sits in time order, wherever the day falls", () => {
        const events = timelineEvents([snap(T0), snap(T0 + 10 * DAY)], [], [], [], horizon(T0 + 5 * DAY));
        expect(events.map((event) => event.kind)).toEqual(["snapshot", "horizon", "snapshot"]);
    });

    it("says the same thing once the day has passed", () => {
        // No escalation, no ageing: a horizon behind you is the same row, in its place on the list.
        const events = timelineEvents([snap(T0 + 10 * DAY)], [], [], [], horizon(T0));
        expect(events.map((event) => event.kind)).toEqual(["horizon", "snapshot"]);
        expect(events[0].horizon?.expectation).toBe("two teams stop waiting");
    });

    it("is not something you ruled, so the judgements filter hides it", () => {
        // The filter is an allow-list of what you decided — and a date you set is not a verdict.
        expect(RENDERER).toContain('event.kind === "judgement" || event.kind === "return" || event.kind === "promotion"');
        expect(RENDERER).not.toContain('event.kind === "horizon" || event.kind === "judgement"');
    });

    it("counts nothing down", () => {
        // The method's own body: the file goes on to render four other kinds of row.
        const start = RENDERER.indexOf("private renderHorizon(");
        const row = RENDERER.slice(start, RENDERER.indexOf(`${String.fromCharCode(10)}    }`, start));
        for (const word of ["days", "remaining", "left", "soon", "overdue"]) {
            expect({ word, found: row.includes(word) }).toEqual({ word, found: false });
        }
    });
});

/**
 * The card still describes what happened (#572 AC-6b).
 *
 * `shareIdeaCard` hands the whole stream to `buildIdeaCard`, which measures the span from the first
 * event to the last. A horizon is the last event and has not happened — so left in, an **image you
 * can post** would claim a span that never occurred.
 */
describe("the shared card ignores what has not happened (#572)", () => {
    const said = (at: number, ...claims: string[]) => ({
        at,
        kind: "snapshot" as const,
        snapshot: { at, state: "fleeting", claims },
    });

    it("measures the same span with a horizon in the stream", () => {
        const past = [said(T0, "X"), said(T0 + 10 * DAY, "Y")];
        const withMark = [...past, { at: T0 + 400 * DAY, kind: "horizon" as const, horizon: horizon(T0 + 400 * DAY) }];
        const before = buildIdeaCard({ path: "Notes/a.md", events: past, linksNow: 2 });
        const after = buildIdeaCard({ path: "Notes/a.md", events: withMark, linksNow: 2 });
        expect(after).toEqual(before);
        expect(after?.elapsedDays).toBe(10);
    });

    it("has nothing to say about a note whose only event is a horizon", () => {
        const only = [{ at: T0, kind: "horizon" as const, horizon: horizon(T0) }];
        expect(buildIdeaCard({ path: "Notes/a.md", events: only, linksNow: 0 })).toBeNull();
    });
});
