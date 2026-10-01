/**
 * Pure aggregation over normalized rows (epic #622, S2). ZettelFlow's own reduction over the
 * typed numeric cells — simple, testable, and offline. (Obsidian's native
 * `BasesQueryResult.getSummaryValue` is a later optimization at the boundary; S2 keeps aggregation
 * pure so it is jest-testable without a `QueryController`.)
 */
import type { Row } from "dashboards/datastore";
import type { AggregateFn } from "./types";

export function numericValues(rows: Row[], field: string): number[] {
    const out: number[] = [];
    for (const row of rows) {
        const cell = row[field];
        if (cell && cell.kind === "number" && typeof cell.raw === "number") out.push(cell.raw);
    }
    return out;
}

export function aggregate(rows: Row[], field: string | undefined, fn: AggregateFn): number {
    if (fn === "count") return rows.length;
    const nums = field ? numericValues(rows, field) : [];
    if (nums.length === 0) return 0;
    switch (fn) {
        case "sum":
            return nums.reduce((a, b) => a + b, 0);
        case "avg":
            return nums.reduce((a, b) => a + b, 0) / nums.length;
        case "min":
            return Math.min(...nums);
        case "max":
            return Math.max(...nums);
    }
}
