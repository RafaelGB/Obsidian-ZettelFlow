import { describe, it, expect } from "@jest/globals";
import { normalize } from "dashboards/datastore";
import type { AdaptedEntry, FieldDescriptor } from "dashboards/datastore";
import { applyTransforms, effectiveFields } from "dashboards/transform";
import type { TransformStep } from "dashboards/transform";

const props: FieldDescriptor[] = [
    { id: "note.cat", name: "Cat" },
    { id: "note.n", name: "N" },
];

function entry(cat: string, n: number): AdaptedEntry {
    return {
        path: `${cat}-${n}.md`,
        cells: {
            "note.cat": { kind: "category", display: cat, raw: cat },
            "note.n": { kind: "number", display: String(n), raw: n },
        },
    };
}

const snap = normalize([entry("x", 2), entry("y", 4), entry("x", 6)], props, "sig");
const step = (s: Partial<TransformStep> & { type: TransformStep["type"] }): TransformStep => ({ id: s.type, ...s });
const nums = (out: ReturnType<typeof applyTransforms>, id: string) => out.rows.map((r) => r[id]?.raw);

describe("transform engine (S5, level 2)", () => {
    it("filters by a numeric comparison", () => {
        const out = applyTransforms(snap, [step({ type: "filter", field: "note.n", op: "gt", value: "3" })]);
        expect(out.rowCount).toBe(2);
        expect(nums(out, "note.n")).toEqual([4, 6]);
    });

    it("sorts by a field descending", () => {
        const out = applyTransforms(snap, [step({ type: "sort", field: "note.n", direction: "desc" })]);
        expect(nums(out, "note.n")).toEqual([6, 4, 2]);
    });

    it("groups and aggregates", () => {
        const out = applyTransforms(snap, [step({ type: "groupBy", field: "note.cat", field2: "note.n", aggregate: "sum" })]);
        expect(out.rowCount).toBe(2);
        expect(out.rows[0]["note.cat"].display).toBe("x");
        expect(out.rows[0]["note.n"].raw).toBe(8);
        expect(out.rows[1]["note.n"].raw).toBe(4);
    });

    it("aggregates all rows to one", () => {
        const out = applyTransforms(snap, [step({ type: "aggregate", field: "note.n", aggregate: "sum" })]);
        expect(out.rowCount).toBe(1);
        expect(out.rows[0]["note.n"].raw).toBe(12);
    });

    it("bins a numeric field into labelled buckets", () => {
        const out = applyTransforms(snap, [step({ type: "bin", field: "note.n", value: "5" })]);
        expect(out.rows.map((r) => r["note.n_bin"].display)).toEqual(["0–5", "0–5", "5–10"]);
    });

    it("calculates a virtual field", () => {
        const out = applyTransforms(snap, [step({ type: "calculate", field: "note.n", op: "mul", value: "2", newField: "d" })]);
        expect(nums(out, "d")).toEqual([4, 8, 12]);
    });

    it("normalizes to 0..1", () => {
        const out = applyTransforms(snap, [step({ type: "normalize", field: "note.n" })]);
        expect(nums(out, "note.n")).toEqual([0, 0.5, 1]);
    });

    it("computes a moving average", () => {
        const out = applyTransforms(snap, [step({ type: "movingAverage", field: "note.n", value: "2" })]);
        expect(nums(out, "note.n_ma")).toEqual([2, 3, 5]);
    });

    it("computes a cumulative sum", () => {
        const out = applyTransforms(snap, [step({ type: "cumulative", field: "note.n" })]);
        expect(nums(out, "note.n_cum")).toEqual([2, 6, 12]);
    });

    it("composes a pipeline in order", () => {
        const out = applyTransforms(snap, [
            step({ type: "filter", field: "note.n", op: "gte", value: "4" }),
            step({ type: "groupBy", field: "note.cat", field2: "note.n", aggregate: "sum" }),
        ]);
        expect(out.rowCount).toBe(2); // y=4, x=6
    });

    it("(§XII) never mutates the source snapshot rows", () => {
        applyTransforms(snap, [step({ type: "calculate", field: "note.n", op: "add", value: "1", newField: "d" })]);
        expect(snap.rows[0]["d"]).toBeUndefined();
        expect(snap.rows[0]["note.n"].raw).toBe(2);
        expect(snap.rowCount).toBe(3);
    });

    it("returns the snapshot untouched for an empty pipeline", () => {
        expect(applyTransforms(snap, [])).toBe(snap);
    });
});

describe("effectiveFields (schema-only projection)", () => {
    it("reshapes for groupBy", () => {
        const fields = effectiveFields(snap.schema.fields, [step({ type: "groupBy", field: "note.cat", field2: "note.n" })]);
        expect(fields.map((f) => f.id)).toEqual(["note.cat", "note.n"]);
    });

    it("adds a calculate output field", () => {
        const fields = effectiveFields(snap.schema.fields, [step({ type: "calculate", newField: "score" })]);
        expect(fields.some((f) => f.id === "score" && f.type === "number")).toBe(true);
    });
});
