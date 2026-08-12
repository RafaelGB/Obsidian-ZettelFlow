import { describe, it, expect } from "@jest/globals";
import {
    buildHeatmapGrid,
    levelForCount,
    pruneCounts,
    toDayKey,
} from "architecture/knowledge/journal/heatmap";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 12, 12, 0, 0); // 2026-08-12 midday UTC
const key = (offset: number) => toDayKey(NOW - offset * DAY);

describe("levelForCount (#162)", () => {
    it("bands counts at the documented thresholds", () => {
        expect([0, 1, 2, 3, 5, 6, 9, 10, 50].map(levelForCount)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
    });
});

describe("buildHeatmapGrid (#162, AC-1)", () => {
    const counts = { [key(0)]: 12, [key(1)]: 4, [key(5)]: 1, [key(400)]: 99 };
    const grid = buildHeatmapGrid(counts, NOW, 52);

    it("spans exactly 52 weeks ending today, oldest first", () => {
        expect(grid.cells).toHaveLength(364);
        expect(grid.cells[363].date).toBe("2026-08-12");
        expect(grid.cells[0].date).toBe(key(363));
    });

    it("carries each day's count + level and excludes days outside the window", () => {
        const cell = (k: string) => grid.cells.find((c) => c.date === k)!;
        expect(cell(key(0))).toEqual({ date: "2026-08-12", count: 12, level: 4 });
        expect(cell(key(1)).count).toBe(4);
        expect(cell(key(1)).level).toBe(2);
        expect(cell(key(5)).level).toBe(1);
        expect(grid.cells.some((c) => c.date === key(400))).toBe(false); // outside the 364-day window
        expect(grid.total).toBe(17); // 12 + 4 + 1, the out-of-window 99 excluded
    });

    it("is all level 0 / total 0 for empty counts", () => {
        const empty = buildHeatmapGrid({}, NOW, 52);
        expect(empty.total).toBe(0);
        expect(empty.cells.every((c) => c.level === 0 && c.count === 0)).toBe(true);
    });
});

describe("pruneCounts (#162, D-a)", () => {
    it("drops keys older than keepDays, keeps the boundary, returns a fresh object", () => {
        const counts = { [key(0)]: 1, [key(369)]: 1, [key(370)]: 1 };
        const pruned = pruneCounts(counts, NOW, 370);
        expect(pruned).toEqual({ [key(0)]: 1, [key(369)]: 1 }); // key(370) dropped, key(369) boundary kept
        expect(pruned).not.toBe(counts);
    });
});
