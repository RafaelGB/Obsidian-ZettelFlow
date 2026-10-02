import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import {
    projectStory,
    relativeAge,
    DECISION_KINDS,
    type StoryRow,
    type TimelineEvent,
} from "architecture/knowledge/state";

// Local-time constructors on purpose: months and "today" are the reader's local calendar (#642).
const at = (y: number, m0: number, d: number, h = 12) => new Date(y, m0, d, h).getTime();
const NOW = at(2026, 9, 10);

const snap = (t: number, state = "fleeting", claims: string[] = []): TimelineEvent => ({
    at: t,
    kind: "snapshot",
    snapshot: { at: t, state, claims },
});
const judgement = (t: number): TimelineEvent => ({
    at: t,
    kind: "judgement",
    judgement: { at: t, path: "a.md", subject: "claim:x", origin: "human", verdict: "accepted" } as never,
});
const ret = (t: number): TimelineEvent => ({ at: t, kind: "return", return: { verdict: "confirmed", judgement: {} as never } });
const promo = (t: number): TimelineEvent => ({ at: t, kind: "promotion", promotion: { to: "literature", judgement: {} as never } });
const move = (t: number): TimelineEvent => ({ at: t, kind: "move", move: { id: `m${t}`, at: t } as never });
const thought = (t: number): TimelineEvent => ({ at: t, kind: "thought", thought: { id: `t${t}`, at: t, path: "_zf/t.md" } });
const horizon = (t: number): TimelineEvent => ({ at: t, kind: "horizon", horizon: { at: t, expectation: "we will know" } });

const ats = (rows: StoryRow[]) => rows.map((row) => (row.kind === "event" ? row.event.at : `fold:${row.hidden}`));

describe("projectStory — months, newest first (#642 AC-1)", () => {
    it("groups by local month, newest month and newest event first, with no empty group", () => {
        const events = [snap(at(2026, 8, 3)), move(at(2026, 8, 20)), judgement(at(2026, 9, 2)), thought(at(2026, 9, 5))];
        const story = projectStory(events, { now: NOW });
        expect(story.groups.map((group) => [group.year, group.month0])).toEqual([
            [2026, 9],
            [2026, 8],
        ]);
        expect(ats(story.groups[0].rows)).toEqual([at(2026, 9, 5), at(2026, 9, 2)]);
        expect(ats(story.groups[1].rows)).toEqual([at(2026, 8, 20), at(2026, 8, 3)]);
        expect(story.groups.every((group) => group.rows.length > 0)).toBe(true);
    });

    it("counts every event in its total, the pinned one included", () => {
        expect(projectStory([move(at(2026, 9, 1)), horizon(at(2026, 9, 20))], { now: NOW }).total).toBe(2);
    });
});

describe("projectStory — unchanged snapshots fold (#642 AC-2, FR-8)", () => {
    const fleeting = [1, 2, 3, 4, 5].map((d) => snap(at(2026, 9, d), "fleeting"));
    const events = [...fleeting, snap(at(2026, 9, 6), "literature")];

    it("shows the newest of a run and folds the rest behind one count", () => {
        const rows = projectStory(events, { now: NOW }).groups[0].rows;
        expect(ats(rows)).toEqual([at(2026, 9, 6), at(2026, 9, 5), "fold:4"]);
        const fold = rows[2];
        expect(fold.kind === "fold" && fold.key).toBe(at(2026, 9, 5));
    });

    it("reveals the folded run in place when its key is expanded", () => {
        const rows = projectStory(events, { now: NOW, expanded: new Set([at(2026, 9, 5)]) }).groups[0].rows;
        expect(rows.filter((row) => row.kind === "event")).toHaveLength(6);
        expect(rows.some((row) => row.kind === "fold")).toBe(false);
    });

    it("never folds across a move", () => {
        const split = [snap(at(2026, 9, 1)), snap(at(2026, 9, 2)), move(at(2026, 9, 3)), snap(at(2026, 9, 4)), snap(at(2026, 9, 5))];
        expect(ats(projectStory(split, { now: NOW }).groups[0].rows)).toEqual([
            at(2026, 9, 5),
            "fold:1",
            at(2026, 9, 3),
            at(2026, 9, 2),
            "fold:1",
        ]);
    });

    it("never folds across a month boundary", () => {
        const split = [snap(at(2026, 8, 29)), snap(at(2026, 8, 30)), snap(at(2026, 9, 1)), snap(at(2026, 9, 2))];
        const story = projectStory(split, { now: NOW });
        expect(ats(story.groups[0].rows)).toEqual([at(2026, 9, 2), "fold:1"]);
        expect(ats(story.groups[1].rows)).toEqual([at(2026, 8, 30), "fold:1"]);
    });
});

describe("projectStory — chips and filters (#642 AC-3, FR-5/6)", () => {
    const events = [
        judgement(at(2026, 9, 1)),
        judgement(at(2026, 9, 2)),
        ret(at(2026, 9, 3)),
        promo(at(2026, 9, 4)),
        move(at(2026, 9, 5)),
        move(at(2026, 9, 6)),
        move(at(2026, 9, 7)),
        ...[1, 2, 3, 4, 5, 6].map((d) => snap(at(2026, 8, d))),
    ];

    it("counts what each chip would show and drops the empty ones", () => {
        expect(projectStory(events, { now: NOW }).chips).toEqual([
            { id: "decisions", count: 4 },
            { id: "moves", count: 3 },
        ]);
    });

    it("shows exactly the decisions under Decisions", () => {
        const rows = projectStory(events, { now: NOW, filter: "decisions" }).groups.flatMap((group) => group.rows);
        expect(rows.map((row) => (row.kind === "event" ? row.event.kind : "fold")).sort()).toEqual([
            "judgement",
            "judgement",
            "promotion",
            "return",
        ]);
        expect([...DECISION_KINDS].sort()).toEqual(["judgement", "promotion", "return"]);
    });

    it("has no chip row for a story of snapshots only", () => {
        expect(projectStory([snap(at(2026, 9, 1)), snap(at(2026, 9, 2), "literature")], { now: NOW }).chips).toEqual([]);
    });
});

describe("projectStory — the day you expect to know by (#642 AC-4, FR-12)", () => {
    it("pins a wager dated today or later above every filter", () => {
        const events = [move(at(2026, 9, 1)), judgement(at(2026, 9, 2)), horizon(at(2026, 9, 11, 0))];
        for (const filter of ["all", "decisions", "moves", "thoughts"] as const) {
            const story = projectStory(events, { now: NOW, filter });
            expect(story.pinned?.expectation).toBe("we will know");
            const kinds = story.groups.flatMap((group) => group.rows).map((row) => (row.kind === "event" ? row.event.kind : "fold"));
            expect(kinds).not.toContain("horizon");
        }
    });

    it("still pins it on its own day", () => {
        expect(projectStory([horizon(at(2026, 9, 10, 0))], { now: NOW }).pinned).toBeDefined();
    });

    it("drops it into its month once the day has passed", () => {
        const story = projectStory([horizon(at(2026, 9, 3, 0))], { now: NOW });
        expect(story.pinned).toBeUndefined();
        expect(story.groups[0].rows.map((row) => row.kind === "event" && row.event.kind)).toEqual(["horizon"]);
    });
});

describe("projectStory — pure (#642 AC-5, FR-11)", () => {
    it("gives the same output for the same input and leaves the input alone", () => {
        const events = [snap(at(2026, 9, 1)), move(at(2026, 9, 2)), snap(at(2026, 9, 3))];
        const copy = JSON.parse(JSON.stringify(events));
        expect(projectStory(events, { now: NOW })).toEqual(projectStory(events, { now: NOW }));
        expect(events).toEqual(copy);
    });

    it("never reads a clock or the platform", () => {
        const source = readFileSync(
            join(__dirname, "../../../../src/architecture/knowledge/timeline/storyProjection.ts"),
            "utf8"
        );
        expect(source).not.toContain("Date.now(");
        expect(source).not.toContain("new Date()");
        expect(source).not.toMatch(/from ["']obsidian["']/);
    });
});

describe("relativeAge (#642 FR-4)", () => {
    const ago = (days: number) => relativeAge(at(2026, 9, 10 - days), NOW);

    it("reads today, yesterday, days, months and years", () => {
        expect(ago(0)).toEqual({ unit: "today", n: 0 });
        expect(ago(1)).toEqual({ unit: "yesterday", n: 1 });
        expect(ago(3)).toEqual({ unit: "days", n: 3 });
        expect(relativeAge(at(2026, 7, 26), NOW)).toEqual({ unit: "months", n: 1 });
        expect(relativeAge(at(2025, 8, 5), NOW)).toEqual({ unit: "years", n: 1 });
    });

    it("clamps a clock that runs ahead to today", () => {
        expect(relativeAge(at(2026, 9, 12), NOW)).toEqual({ unit: "today", n: 0 });
    });
});
