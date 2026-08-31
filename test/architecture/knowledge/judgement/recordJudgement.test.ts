import { describe, it, expect } from "@jest/globals";
import {
    DEFAULT_MAX_JUDGEMENTS,
    recordJudgement,
    sanitizeJudgementLog,
    type Judgement,
} from "architecture/knowledge/judgement";

const T0 = Date.UTC(2026, 7, 31, 10, 0, 0);

function entry(over: Partial<Judgement> = {}): Judgement {
    return {
        at: T0,
        path: "ideas/atomicity.md",
        subject: "challenge-idea",
        origin: "ai",
        verdict: "rejected",
        ...over,
    };
}

describe("recordJudgement (#336, FR-6)", () => {
    it("appends to a new array and never mutates the input", () => {
        const history: Judgement[] = [];
        const next = recordJudgement(history, entry());

        expect(next).not.toBe(history);
        expect(history).toEqual([]);
        expect(next).toEqual([entry()]);
    });

    it("keeps entries in the order they were recorded", () => {
        let history: Judgement[] = [];
        history = recordJudgement(history, entry({ at: T0, subject: "a" }));
        history = recordJudgement(history, entry({ at: T0 + 1000, subject: "b" }));

        expect(history.map((j) => j.subject)).toEqual(["a", "b"]);
    });

    it("returns the same reference for an entry with no path", () => {
        const history = [entry()];
        expect(recordJudgement(history, entry({ path: "   " }))).toBe(history);
    });

    it("returns the same reference for an entry with no subject", () => {
        const history = [entry()];
        expect(recordJudgement(history, entry({ subject: "" }))).toBe(history);
    });

    it("returns the same reference for an origin outside the closed union", () => {
        const history = [entry()];
        const bogus = entry({ origin: "guess" as Judgement["origin"] });
        expect(recordJudgement(history, bogus)).toBe(history);
    });

    it("returns the same reference for a verdict outside the closed union", () => {
        const history = [entry()];
        const bogus = entry({ verdict: "maybe" as Judgement["verdict"] });
        expect(recordJudgement(history, bogus)).toBe(history);
    });

    it("returns the same reference when the entry repeats the last one exactly", () => {
        const history = recordJudgement([], entry());
        expect(recordJudgement(history, entry())).toBe(history);
    });

    it("records the same verdict again once the timestamp moves on", () => {
        const history = recordJudgement([], entry());
        expect(recordJudgement(history, entry({ at: T0 + 1 })).length).toBe(2);
    });

    it("caps the log at maxLen, dropping the oldest", () => {
        let history: Judgement[] = [];
        for (let i = 0; i < 5; i++) history = recordJudgement(history, entry({ at: T0 + i, subject: `s${i}` }));

        const capped = recordJudgement(history, entry({ at: T0 + 5, subject: "s5" }), { maxLen: 3 });
        expect(capped.map((j) => j.subject)).toEqual(["s3", "s4", "s5"]);
    });

    it("defaults to a bounded log", () => {
        expect(DEFAULT_MAX_JUDGEMENTS).toBeGreaterThan(0);
        expect(Number.isFinite(DEFAULT_MAX_JUDGEMENTS)).toBe(true);
    });

    it("never throws on a malformed entry", () => {
        const history = [entry()];
        expect(() => recordJudgement(history, undefined as unknown as Judgement)).not.toThrow();
        expect(recordJudgement(history, null as unknown as Judgement)).toBe(history);
    });

    it("drops an optional note that carries no text", () => {
        const [recorded] = recordJudgement([], entry({ note: "   " }));
        expect(recorded.note).toBeUndefined();
    });

    it("keeps an optional note that carries text", () => {
        const [recorded] = recordJudgement([], entry({ note: "the counterexample stands" }));
        expect(recorded.note).toBe("the counterexample stands");
    });
});

describe("sanitizeJudgementLog (#336, AC-5)", () => {
    it("turns a missing or non-array blob into an empty log", () => {
        expect(sanitizeJudgementLog(undefined)).toEqual([]);
        expect(sanitizeJudgementLog(null)).toEqual([]);
        expect(sanitizeJudgementLog("corrupt")).toEqual([]);
        expect(sanitizeJudgementLog({ log: [] })).toEqual([]);
    });

    it("keeps the valid entries and drops the broken ones", () => {
        const raw = [entry(), { nonsense: true }, entry({ at: T0 + 1, verdict: "accepted" }), null];
        expect(sanitizeJudgementLog(raw)).toEqual([entry(), entry({ at: T0 + 1, verdict: "accepted" })]);
    });

    it("never throws", () => {
        expect(() => sanitizeJudgementLog([{ at: "soon" }, Symbol("x")])).not.toThrow();
    });
});
