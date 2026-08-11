import { describe, it, expect } from "@jest/globals";
import { computeMaturity, MATURITY_WEIGHTS } from "actions/calculateMaturity/maturityLogic";
import { idea, buildModel } from "./support/knowledgeFixture";

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;
const tenLinks = Array.from({ length: 10 }, (_, i) => ({ to: `t${i}.md` }));
const fifteenLinks = Array.from({ length: 15 }, (_, i) => ({ to: `t${i}.md` }));

const model = buildModel([
    // fleeting, degree 0, no sources, age 0 → floor 0
    idea("zero.md", "fleeting", [], { created: NOW }),
    // evergreen, degree 10, sources, age 200d → ceiling 100
    idea("full.md", "evergreen", tenLinks, { hasSources: true, created: NOW - 200 * DAY }),
    // permanent(0.8)·conn(1.0)·sources(1)·recency(0) → 40*.8+30+15+0 = 77
    idea("mid.md", "permanent", tenLinks, { hasSources: true, created: NOW }),
    // degree > cap must not exceed 100 (connectivity clamps at 1)
    idea("over.md", "evergreen", fifteenLinks, { hasSources: true, created: NOW - 400 * DAY }),
    ...Array.from({ length: 15 }, (_, i) => idea(`t${i}.md`, "fleeting", [])),
]);

describe("computeMaturity (#153, FR-S2, OQ-2, AC-1/AC-4/AC-7)", () => {
    it("weights sum to 100 so the raw score is already 0-100", () => {
        const { state, connectivity, sources, recency } = MATURITY_WEIGHTS;
        expect(state + connectivity + sources + recency).toBe(100);
    });

    it("floors at 0 for a fresh fleeting isolated note", () => {
        expect(computeMaturity(model, "zero.md", NOW)).toBe(0);
    });

    it("reaches 100 for a well-connected, sourced, seasoned evergreen note", () => {
        expect(computeMaturity(model, "full.md", NOW)).toBe(100);
    });

    it("computes the documented mid case (permanent, connected, sourced, brand-new) as 77", () => {
        expect(computeMaturity(model, "mid.md", NOW)).toBe(77);
    });

    it("clamps at 100 even when connectivity exceeds the cap", () => {
        expect(computeMaturity(model, "over.md", NOW)).toBe(100);
    });

    it("returns null for a note absent from the model", () => {
        expect(computeMaturity(model, "missing.md", NOW)).toBeNull();
    });

    it("is deterministic for the same (model, path, now)", () => {
        expect(computeMaturity(model, "mid.md", NOW)).toBe(computeMaturity(model, "mid.md", NOW));
    });
});
