import { describe, it, expect } from "@jest/globals";
import { aggregate, numericValues } from "dashboards/panels";
import type { Row } from "dashboards/datastore";

function row(n: number | null): Row {
    return { "note.x": { kind: n === null ? null : "number", display: String(n ?? ""), raw: n } };
}

const rows: Row[] = [row(2), row(4), row(6), row(null)];

describe("aggregate (S2)", () => {
    it("collects only numeric cells", () => {
        expect(numericValues(rows, "note.x")).toEqual([2, 4, 6]);
    });

    it("sums, averages, min and max over the numeric values", () => {
        expect(aggregate(rows, "note.x", "sum")).toBe(12);
        expect(aggregate(rows, "note.x", "avg")).toBe(4);
        expect(aggregate(rows, "note.x", "min")).toBe(2);
        expect(aggregate(rows, "note.x", "max")).toBe(6);
    });

    it("counts rows regardless of the field", () => {
        expect(aggregate(rows, "note.x", "count")).toBe(4);
        expect(aggregate(rows, undefined, "count")).toBe(4);
    });

    it("is zero when there is nothing numeric to reduce", () => {
        expect(aggregate([], "note.x", "sum")).toBe(0);
        expect(aggregate([row(null)], "note.x", "avg")).toBe(0);
    });
});
