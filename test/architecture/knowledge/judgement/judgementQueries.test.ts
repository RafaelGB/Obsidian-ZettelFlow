import { describe, it, expect } from "@jest/globals";
import {
    agencySignals,
    judgementDays,
    judgementsFor,
    lastJudgementFor,
    type Judgement,
} from "architecture/knowledge/judgement";
import { toDayKey } from "architecture/knowledge/journal/heatmap";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 7, 31, 10, 0, 0);
const A = "ideas/atomicity.md";
const B = "ideas/emergence.md";

function j(over: Partial<Judgement> = {}): Judgement {
    return { at: T0, path: A, subject: "connect", origin: "derived", verdict: "accepted", ...over };
}

describe("judgementsFor (#336, FR-8)", () => {
    it("returns an empty list for an empty log", () => {
        expect(judgementsFor([], A)).toEqual([]);
    });

    it("returns an empty list for a path with no judgements", () => {
        expect(judgementsFor([j()], B)).toEqual([]);
    });

    it("returns only that path's judgements, oldest first", () => {
        const log = [j({ at: T0, subject: "one" }), j({ at: T0 + 1, path: B }), j({ at: T0 + 2, subject: "two" })];
        expect(judgementsFor(log, A).map((entry) => entry.subject)).toEqual(["one", "two"]);
    });

    it("does not match a path by prefix", () => {
        expect(judgementsFor([j({ path: "ideas/atomicity-notes.md" })], A)).toEqual([]);
    });
});

describe("lastJudgementFor (#336)", () => {
    it("is null when the idea has never been ruled on", () => {
        expect(lastJudgementFor([], A)).toBeNull();
        expect(lastJudgementFor([j({ path: B })], A)).toBeNull();
    });

    it("is the most recent judgement for that path", () => {
        const log = [j({ at: T0, subject: "old" }), j({ at: T0 + DAY, subject: "new" })];
        expect(lastJudgementFor(log, A)?.subject).toBe("new");
    });
});

describe("agencySignals (#336, AC-1 — a well-defined unknown, never a score)", () => {
    it("reports an untouched idea as zero activity with no last verdict", () => {
        const signals = agencySignals([], A);

        expect(signals.path).toBe(A);
        expect(signals.total).toBe(0);
        expect(signals.lastAt).toBeNull();
    });

    it("exposes no score, ratio or grade", () => {
        const keys = Object.keys(agencySignals([j()], A));
        expect(keys).not.toContain("score");
        expect(keys).not.toContain("ratio");
        expect(keys).not.toContain("grade");
    });

    it("starts every verdict and origin at zero so callers never read undefined", () => {
        const signals = agencySignals([], A);

        expect(signals.byVerdict).toEqual({ accepted: 0, modified: 0, rejected: 0, confirmed: 0, challenged: 0 });
        expect(signals.byOrigin).toEqual({ ai: 0, derived: 0, human: 0 });
    });

    it("counts by verdict and by origin for that path only", () => {
        const log = [
            j({ at: T0, verdict: "accepted", origin: "ai" }),
            j({ at: T0 + 1, verdict: "rejected", origin: "ai" }),
            j({ at: T0 + 2, verdict: "rejected", origin: "human" }),
            j({ at: T0 + 3, path: B, verdict: "rejected", origin: "ai" }),
        ];
        const signals = agencySignals(log, A);

        expect(signals.total).toBe(3);
        expect(signals.byVerdict.rejected).toBe(2);
        expect(signals.byVerdict.accepted).toBe(1);
        expect(signals.byOrigin.ai).toBe(2);
        expect(signals.byOrigin.human).toBe(1);
        expect(signals.lastAt).toBe(T0 + 2);
    });
});

describe("judgementDays (#336, the tally S4 reframes the streak onto)", () => {
    it("is empty for an empty log", () => {
        expect(judgementDays([])).toEqual({});
    });

    it("tallies per UTC day using the journal's own day key", () => {
        const log = [j({ at: T0 }), j({ at: T0 + 60_000, subject: "another" }), j({ at: T0 + DAY, subject: "next" })];
        const days = judgementDays(log);

        expect(days[toDayKey(T0)]).toBe(2);
        expect(days[toDayKey(T0 + DAY)]).toBe(1);
    });

    it("counts every path, because the streak is a question about you and not about one idea", () => {
        expect(judgementDays([j({ path: A }), j({ at: T0 + 1, path: B })])[toDayKey(T0)]).toBe(2);
    });
});
