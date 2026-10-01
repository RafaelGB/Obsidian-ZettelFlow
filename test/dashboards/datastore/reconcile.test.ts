import { describe, it, expect } from "@jest/globals";
import { normalize, reconcilePlan } from "dashboards/datastore";
import type { AdaptedEntry, FieldDescriptor } from "dashboards/datastore";

const props: FieldDescriptor[] = [
    { id: "note.a", name: "A" },
    { id: "note.b", name: "B" },
];

function entry(path: string): AdaptedEntry {
    return {
        path,
        cells: {
            "note.a": { kind: "number", display: "1", raw: 1 },
            "note.b": { kind: "category", display: "x", raw: "x" },
        },
    };
}

describe("reconcile plan (AC-4 — updates in place, no full rebuild)", () => {
    it("a filter that drops rows but keeps fields yields no field churn, only a count change", () => {
        const before = normalize([entry("a.md"), entry("b.md")], props, "sig-2rows");
        const after = normalize([entry("a.md")], props, "sig-1row");
        const plan = reconcilePlan(before, after);
        expect(plan.added).toEqual([]);
        expect(plan.removed).toEqual([]);
        expect(plan.unchanged).toEqual(["note.a", "note.b"]);
        expect(plan.rowCountChanged).toBe(true);
    });

    it("registers an added visible property as an added field", () => {
        const before = normalize([entry("a.md")], [props[0]], "sig-a");
        const after = normalize([entry("a.md")], props, "sig-ab");
        const plan = reconcilePlan(before, after);
        expect(plan.added).toEqual(["note.b"]);
        expect(plan.removed).toEqual([]);
    });

    it("treats a null previous snapshot as a full add", () => {
        const after = normalize([entry("a.md")], props, "sig-x");
        const plan = reconcilePlan(null, after);
        expect(plan.added).toEqual(["note.a", "note.b"]);
        expect(plan.rowCountChanged).toBe(true);
    });
});
