import { describe, it, expect } from "@jest/globals";
import {
    dueClaims,
    lastClaimChangeAt,
    claimBearingPaths,
    DEFAULT_RETURN_INTERVAL_DAYS,
    RETURN_INTERVAL_MAX_DAYS,
    RETURN_INTERVAL_MIN_DAYS,
} from "architecture/knowledge/review/dueClaims";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import type { Idea } from "architecture/knowledge/model/Idea";
import type { Judgement } from "architecture/knowledge/judgement";
import type { Snapshot } from "architecture/knowledge/timeline/recordSnapshot";

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;
const INTERVAL = DEFAULT_RETURN_INTERVAL_DAYS;

function idea(path: string, claim: string | undefined, modified: number): Idea {
    return {
        path,
        title: path,
        created: 0,
        modified,
        state: "fleeting",
        maturitySignals: { degree: 0, inbound: 0, outbound: 0, ageDays: 0, sourceCount: 0 },
        relations: [],
        claims: claim ? [{ text: claim, sources: [] }] : [],
    } as unknown as Idea;
}

function modelOf(ideas: Idea[]): KnowledgeModel {
    const model = new KnowledgeModel();
    model.build(ideas);
    return model;
}

/**
 * When a claim comes back (#563, epic #558).
 *
 * The rules that matter are the refusals: **at most one**, never before the boundary, and the same
 * answer twice for the same vault. A queue would make this an inbox, and an inbox is a debt.
 */
describe("at most one, and only past the boundary (#563)", () => {
    it("offers nothing on a vault with no claims", () => {
        const model = modelOf([idea("Notes/a.md", undefined, NOW - 400 * DAY)]);
        expect(dueClaims({ model, intervalDays: INTERVAL, now: NOW })).toEqual([]);
    });

    it("waits for the boundary, to the millisecond", () => {
        const almost = modelOf([idea("Notes/a.md", "a claim", NOW - INTERVAL * DAY + 1)]);
        expect(dueClaims({ model: almost, intervalDays: INTERVAL, now: NOW })).toEqual([]);

        const exactly = modelOf([idea("Notes/a.md", "a claim", NOW - INTERVAL * DAY)]);
        const due = dueClaims({ model: exactly, intervalDays: INTERVAL, now: NOW });
        expect(due).toHaveLength(1);
        expect(due[0]).toEqual({ path: "Notes/a.md", claim: "a claim", lastTouched: NOW - INTERVAL * DAY });
    });

    it("offers one even when five are due, and it is the oldest", () => {
        const model = modelOf([
            idea("Notes/a.md", "a", NOW - 100 * DAY),
            idea("Notes/b.md", "b", NOW - 300 * DAY),
            idea("Notes/c.md", "c", NOW - 200 * DAY),
            idea("Notes/d.md", "d", NOW - 150 * DAY),
            idea("Notes/e.md", "e", NOW - 120 * DAY),
        ]);
        const due = dueClaims({ model, intervalDays: INTERVAL, now: NOW });
        expect(due).toHaveLength(1);
        expect(due[0].path).toBe("Notes/b.md");
    });

    it("breaks a tie by path, and says the same thing twice", () => {
        const model = modelOf([
            idea("Notes/b.md", "b", NOW - 200 * DAY),
            idea("Notes/a.md", "a", NOW - 200 * DAY),
        ]);
        const first = dueClaims({ model, intervalDays: INTERVAL, now: NOW });
        const second = dueClaims({ model, intervalDays: INTERVAL, now: NOW });
        expect(first[0].path).toBe("Notes/a.md");
        expect(second).toEqual(first);
    });

    it("offers nothing on a fresh vault at the longest interval", () => {
        const model = modelOf([idea("Notes/a.md", "a claim", NOW - 30 * DAY)]);
        expect(dueClaims({ model, intervalDays: RETURN_INTERVAL_MAX_DAYS, now: NOW })).toEqual([]);
        expect(RETURN_INTERVAL_MIN_DAYS).toBeLessThan(RETURN_INTERVAL_MAX_DAYS);
    });

    it("lists what actually says something", () => {
        const model = modelOf([idea("Notes/a.md", "a", 0), idea("Notes/b.md", undefined, 0)]);
        expect(claimBearingPaths(model)).toEqual([{ path: "Notes/a.md", claim: "a" }]);
    });
});

/**
 * It reads only what already exists (#563 FR-2).
 *
 * Four sources, and the newest of them wins. The important one is the last: **any** verdict on this
 * claim resets the clock, because being asked and saying *it still says this* is exactly as much of
 * an answer as rewriting it.
 */
describe("what counts as having touched a claim (#563)", () => {
    const old = NOW - 300 * DAY;

    it("uses the judgement record alone when the timeline is off", () => {
        const model = modelOf([idea("Notes/a.md", "a", old)]);
        const judgements: Judgement[] = [
            { at: NOW - 2 * DAY, path: "Notes/a.md", subject: "claim:Notes/a.md", origin: "derived", verdict: "confirmed" },
        ];
        expect(dueClaims({ model, judgements, snapshots: {}, intervalDays: INTERVAL, now: NOW })).toEqual([]);
    });

    it("resets the clock for every one of the three answers", () => {
        const model = modelOf([idea("Notes/a.md", "a", old)]);
        for (const verdict of ["confirmed", "modified", "rejected"] as const) {
            const judgements: Judgement[] = [
                { at: NOW - DAY, path: "Notes/a.md", subject: "claim:Notes/a.md", origin: "derived", verdict },
            ];
            expect(dueClaims({ model, judgements, intervalDays: INTERVAL, now: NOW })).toEqual([]);
        }
    });

    it("ignores a verdict about something else on the same note", () => {
        const model = modelOf([idea("Notes/a.md", "a", old)]);
        const judgements: Judgement[] = [
            { at: NOW - DAY, path: "Notes/a.md", subject: "gap:Notes/b.md", origin: "derived", verdict: "rejected" },
        ];
        expect(dueClaims({ model, judgements, intervalDays: INTERVAL, now: NOW })).toHaveLength(1);
    });

    it("prefers a recent claim change over an older verdict", () => {
        const model = modelOf([idea("Notes/a.md", "a", old)]);
        const snapshots: Record<string, Snapshot[]> = {
            "Notes/a.md": [
                { at: old, state: "fleeting", claims: ["was this"] },
                { at: NOW - DAY, state: "fleeting", claims: ["says this now"] },
            ],
        };
        const judgements: Judgement[] = [
            { at: old, path: "Notes/a.md", subject: "claim:Notes/a.md", origin: "human", verdict: "accepted" },
        ];
        expect(dueClaims({ model, judgements, snapshots, intervalDays: INTERVAL, now: NOW })).toEqual([]);
    });

    it("lets last-reviewed win when it is the newest", () => {
        const model = modelOf([idea("Notes/a.md", "a", old)]);
        const lastReviewed = { "Notes/a.md": NOW - DAY };
        expect(dueClaims({ model, lastReviewed, intervalDays: INTERVAL, now: NOW })).toEqual([]);
    });

    it("falls back to when the note was last modified", () => {
        const model = modelOf([idea("Notes/a.md", "a", NOW - DAY)]);
        expect(dueClaims({ model, intervalDays: INTERVAL, now: NOW })).toEqual([]);
    });

    it("dates a claim from when it changed, not from the last lifecycle promotion", () => {
        const history: Snapshot[] = [
            { at: 1_000, state: "fleeting", claims: ["one"] },
            { at: 2_000, state: "fleeting", claims: ["two"] },
            { at: 3_000, state: "permanent", claims: ["two"] },
        ];
        expect(lastClaimChangeAt(history)).toBe(2_000);
        expect(lastClaimChangeAt([{ at: 500, state: "fleeting", claims: ["one"] }])).toBe(500);
        expect(lastClaimChangeAt([])).toBeUndefined();
        expect(lastClaimChangeAt(undefined)).toBeUndefined();
    });
});
