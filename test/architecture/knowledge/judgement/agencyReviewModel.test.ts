import { describe, it, expect } from "@jest/globals";
import {
    agencyReviewModel,
    AGENCY_READING_MIN_SAMPLE,
} from "architecture/knowledge/judgement/agencyReviewModel";
import { agencyIndex, verdictBreakdown, INTERPRETIVE_ORIGINS } from "architecture/knowledge/judgement";
import type { Judgement } from "architecture/knowledge/judgement";

const T0 = Date.UTC(2026, 8, 1, 10, 0, 0);

function j(over: Partial<Judgement> = {}): Judgement {
    return { at: T0, path: "ideas/atomicity.md", subject: "connect", origin: "ai", verdict: "accepted", ...over };
}

/** C6 (#389) — the pure Agency-review view model. Empty log ⇒ friendly, not a crash; newest-first;
 *  locale-free tokens; header numbers consume C5, not re-derived. */
describe("agencyReviewModel (#389)", () => {
    it("yields a friendly empty model for an empty log (no throw)", () => {
        const model = agencyReviewModel([]);
        expect(model.rows).toEqual([]);
        expect(model.header.index).toBeNull();
        expect(model.header.interpretive).toBe(0);
        expect(model.header.reading).toBe("unknown");
    });

    it("orders rows newest-first", () => {
        const log = [j({ at: T0, subject: "a" }), j({ at: T0 + 2000, subject: "c" }), j({ at: T0 + 1000, subject: "b" })];
        expect(agencyReviewModel(log).rows.map((r) => r.subject)).toEqual(["c", "b", "a"]);
    });

    it("maps each row's basename (folder + .md stripped) and passes tokens through verbatim", () => {
        const log = [j({ path: "ideas/deep/atomicity.md", verdict: "modified", origin: "derived", confidence: "high", note: "why" })];
        const row = agencyReviewModel(log).rows[0];
        expect(row.basename).toBe("atomicity");
        expect(row.verdict).toBe("modified");
        expect(row.origin).toBe("derived");
        expect(row.confidence).toBe("high");
        expect(row.note).toBe("why");
    });

    it("reads a shaping-heavy interpretive log as 'deciding'", () => {
        const log = [
            ...Array.from({ length: 5 }, () => j({ verdict: "modified" })),
            ...Array.from({ length: 5 }, () => j({ verdict: "accepted" })),
        ];
        expect(agencyReviewModel(log).header.reading).toBe("deciding"); // index 0.5
    });

    it("reads an accept-heavy interpretive log as 'accepting'", () => {
        const log = Array.from({ length: 10 }, () => j({ verdict: "accepted" }));
        expect(agencyReviewModel(log).header.reading).toBe("accepting"); // index 0
    });

    it("reads a middling mix as 'mixed'", () => {
        const log = [
            ...Array.from({ length: 2 }, () => j({ verdict: "modified" })),
            ...Array.from({ length: 8 }, () => j({ verdict: "accepted" })),
        ];
        expect(agencyReviewModel(log).header.reading).toBe("mixed"); // index 0.2
    });

    it("reads too small a sample as 'unknown'", () => {
        const log = Array.from({ length: AGENCY_READING_MIN_SAMPLE - 1 }, () => j({ verdict: "modified" }));
        expect(agencyReviewModel(log).header.reading).toBe("unknown");
    });

    it("consumes C5's metrics for the header (does not re-derive)", () => {
        const log = [j({ verdict: "accepted" }), j({ verdict: "modified" }), j({ verdict: "rejected", origin: "human" })];
        const model = agencyReviewModel(log);
        expect(model.header.index).toBe(agencyIndex(log).index);
        const breakdown = verdictBreakdown(log, { origins: INTERPRETIVE_ORIGINS });
        expect(model.header.accepted).toBe(breakdown.byVerdict.accepted);
        expect(model.header.modified).toBe(breakdown.byVerdict.modified);
        expect(model.header.rejected).toBe(breakdown.byVerdict.rejected);
    });
});
