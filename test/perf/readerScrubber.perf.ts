import { describe, it } from "@jest/globals";
import { scrubberModel } from "architecture/components/core/reader/readerScrubber";
import { BUDGETS, checkBudget, describeBudget, type BudgetKey } from "./budgets";

/**
 * The book at a glance (#813 T8): what the line costs to draw from a long, heavily marked book —
 * done once per opening and again when a mark, a layer or a bookmark changes, never per frame.
 */
function assertBudget(key: BudgetKey, measured: number): void {
    const result = checkBudget(key, measured);
    // eslint-disable-next-line no-console
    console.log(describeBudget(result));
    if (!result.within) throw new Error(`${describeBudget(result)} — this budget exists because: ${BUDGETS[key].because}`);
}

describe("the book's line (#813)", () => {
    it("lays out 120 chapters with 2,000 highlights and 200 bookmarks", () => {
        const meanings = ["idea", "question", "quote", "discuss"] as const;
        const input = {
            weights: Array.from({ length: 120 }, (_, i) => 4000 + ((i * 7919) % 30000)),
            marks: Array.from({ length: 2000 }, (_, i) => ({ at: (i * 37) % 120, meaning: meanings[i % 4] })),
            bookmarks: Array.from({ length: 200 }, (_, i) => ({ chapter: (i * 13) % 120, share: (i % 10) / 10 })),
        };
        let fastest = Number.POSITIVE_INFINITY;
        for (let run = 0; run < 5; run++) {
            const start = performance.now();
            scrubberModel(input);
            fastest = Math.min(fastest, performance.now() - start);
        }
        assertBudget("reader.scrubber.model.120ch", fastest);
    });
});
