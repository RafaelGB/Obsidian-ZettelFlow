import { describe, it, expect } from "@jest/globals";
import {
    agencyIndex,
    verdictBreakdown,
    INTERPRETIVE_ORIGINS,
    type Judgement,
} from "architecture/knowledge/judgement";

const T0 = Date.UTC(2026, 8, 1, 10, 0, 0);
const A = "ideas/atomicity.md";

function j(over: Partial<Judgement> = {}): Judgement {
    return { at: T0, path: A, subject: "connect", origin: "ai", verdict: "accepted", ...over };
}

/**
 * C5 (#388) — local, vault-wide agency metrics over the JudgementLog. They must be pure, neutral on an
 * empty log (never a crash, never a zero-grade), and computed only from recorded verdicts (§XII).
 */
describe("verdictBreakdown (#388)", () => {
    it("returns a fully-zeroed shape for an empty log (never undefined)", () => {
        const out = verdictBreakdown([]);
        expect(out.total).toBe(0);
        expect(out.byVerdict.accepted).toBe(0);
        expect(out.byVerdict.rejected).toBe(0);
    });

    it("tallies every verdict when no origins filter is given", () => {
        const log = [j({ verdict: "accepted" }), j({ verdict: "modified" }), j({ verdict: "rejected", origin: "human" })];
        const out = verdictBreakdown(log);
        expect(out.total).toBe(3);
        expect(out.byVerdict.accepted).toBe(1);
        expect(out.byVerdict.modified).toBe(1);
        expect(out.byVerdict.rejected).toBe(1);
    });

    it("scopes the tally to the given origins (the AI accept/modify/reject rate)", () => {
        const log = [j({ origin: "ai", verdict: "accepted" }), j({ origin: "human", verdict: "rejected" })];
        const out = verdictBreakdown(log, { origins: INTERPRETIVE_ORIGINS });
        expect(out.total).toBe(1); // the human verdict is excluded
        expect(out.byVerdict.accepted).toBe(1);
        expect(out.byVerdict.rejected).toBe(0);
    });
});

describe("agencyIndex (#388)", () => {
    it("is neutral (null index) on an empty log — an unknown, not a zero grade", () => {
        expect(agencyIndex([])).toEqual({ interpretive: 0, shaped: 0, index: null });
    });

    it("is 0 when every interpretive proposal was accepted as-is", () => {
        const log = [j({ verdict: "accepted" }), j({ verdict: "accepted", origin: "derived" })];
        const out = agencyIndex(log);
        expect(out.interpretive).toBe(2);
        expect(out.shaped).toBe(0);
        expect(out.index).toBe(0);
    });

    it("is 1 when every interpretive proposal was shaped (modified/rejected/challenged)", () => {
        const log = [j({ verdict: "modified" }), j({ verdict: "rejected" }), j({ verdict: "challenged" })];
        const out = agencyIndex(log);
        expect(out.interpretive).toBe(3);
        expect(out.shaped).toBe(3);
        expect(out.index).toBe(1);
    });

    it("counts a mix and excludes your own (human) verdicts from the interpretive signal", () => {
        const log = [
            j({ verdict: "accepted" }),           // ai, not shaped
            j({ verdict: "modified", origin: "derived" }), // interpretive, shaped
            j({ verdict: "rejected", origin: "human" }),   // your own → excluded
        ];
        const out = agencyIndex(log);
        expect(out.interpretive).toBe(2);
        expect(out.shaped).toBe(1);
        expect(out.index).toBe(0.5);
    });

    it("honours an explicit origins option", () => {
        const log = [j({ origin: "human", verdict: "modified" })];
        expect(agencyIndex(log, { origins: ["human"] })).toEqual({ interpretive: 1, shaped: 1, index: 1 });
    });
});
