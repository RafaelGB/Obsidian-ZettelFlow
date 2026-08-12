import { describe, it, expect } from "@jest/globals";
import { recordDay, toDayKey } from "architecture/knowledge/journal/heatmap";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 12, 12, 0, 0);
const today = toDayKey(NOW);

describe("recordDay (#162, D-a)", () => {
    it("increments today's bucket from empty", () => {
        expect(recordDay({}, NOW)).toEqual({ [today]: 1 });
    });

    it("increments an existing bucket and returns a fresh object", () => {
        const counts = { [today]: 2 };
        const next = recordDay(counts, NOW);
        expect(next).toEqual({ [today]: 3 });
        expect(next).not.toBe(counts);
    });

    it("prunes keys older than the retention window when recording", () => {
        const counts = { [toDayKey(NOW - 400 * DAY)]: 5 };
        expect(recordDay(counts, NOW)).toEqual({ [today]: 1 });
    });
});
