import { describe, it, expect } from "@jest/globals";
import { BUDGETS, checkBudget, describeBudget, type BudgetKey } from "./budgets";

/**
 * The gate itself (#457).
 *
 * The budget suite is slow and lives in its own CI step, but whether a budget *fails* when it
 * should is a property worth checking on every push — a gate that silently passes is worse than
 * no gate, because it is believed.
 */
describe("budgets that fail the build (#457)", () => {
    const keys = Object.keys(BUDGETS) as BudgetKey[];

    it("passes a measurement inside the ceiling", () => {
        const result = checkBudget("index.build.10k", 50);
        expect(result.within).toBe(true);
        expect(describeBudget(result)).toContain("within");
    });

    it("fails a measurement over it, and says by how much", () => {
        const result = checkBudget("index.build.10k", 300);
        expect(result.within).toBe(false);
        // 300 against a 150 ms ceiling: the message has to make the size of the regression
        // obvious, or the next person just raises the number.
        expect(describeBudget(result)).toContain("OVER by 100%");
    });

    it("counts a measurement exactly on the ceiling as within it", () => {
        expect(checkBudget("index.build.10k", BUDGETS["index.build.10k"].limit).within).toBe(true);
    });

    it("names what it measured, so a failure needs no second lookup", () => {
        expect(describeBudget(checkBudget("analysis.discovery.10k", 9_000))).toContain(
            "find discoveries over 10,000 notes"
        );
    });

    it("makes every budget state why that number, and what it was measured at", () => {
        for (const key of keys) {
            expect(BUDGETS[key].because.length).toBeGreaterThan(20);
            expect(BUDGETS[key].measured).toBeTruthy();
            expect(BUDGETS[key].limit).toBeGreaterThan(0);
        }
    });

    it("covers the index, one derive, the enrichment parse, the projections and memory", () => {
        // Not a list copied for its own sake: a budget file that quietly loses a dimension is how
        // a regression gets through, so the shape of the coverage is asserted.
        expect(keys).toEqual(
            expect.arrayContaining([
                "index.build.50k",
                "derive.one",
                "enrich.parse.50k",
                "analysis.gaps.tally.10k",
                "analysis.gaps.seams.10k",
                "analysis.discovery.10k",
                "analysis.discovery.scaling",
                "model.memory.50k",
                "analysis.gaps.top.all.10k",
                "memo.gaps.10k",
            ])
        );
    });

    it("keeps headroom over the measured baseline, so a noisy runner is not a failure", () => {
        // Every ceiling must be comfortably above what was measured. A budget sitting on its own
        // measurement is the fastest way to teach a team to ignore a red build.
        const numeric = (text: string) => Number(text.replace(/[^\d.]/g, ""));
        for (const key of keys) {
            const baseline = numeric(BUDGETS[key].measured);
            if (!Number.isFinite(baseline) || baseline === 0) continue;
            expect(BUDGETS[key].limit).toBeGreaterThan(baseline);
        }
    });
});
