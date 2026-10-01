import { describe, it, expect } from "@jest/globals";
import { normalize } from "dashboards/datastore";
import type { AdaptedEntry, FieldDescriptor } from "dashboards/datastore";
import { runComputed } from "dashboards/transform";
import type { PlainRow } from "dashboards/transform";

const props: FieldDescriptor[] = [
    { id: "note.hours", name: "Hours" },
    { id: "note.ref", name: "Ref" },
];
function entry(hours: number, ref: string): AdaptedEntry {
    return {
        path: `${hours}.md`,
        cells: {
            "note.hours": { kind: "number", display: String(hours), raw: hours },
            "note.ref": { kind: "link", display: ref, raw: ref },
        },
    };
}
const snap = normalize([entry(6, "[[A]]"), entry(8, "[[B]]")], props, "sig");

describe("computed fields core (#632)", () => {
    it("adds a new column with its inferred type, keeping base field types (AC-2/AC-3)", async () => {
        const run = (rows: PlainRow[]) => rows.map((r) => ({ ...r, score: (r["note.hours"] as number) / 8 }));
        const result = await runComputed(snap, run);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.fields.find((f) => f.id === "score")?.type).toBe("number");
        // the base link column keeps its link type — the merge preserves base cells, not re-tags them.
        expect(result.fields.find((f) => f.id === "note.ref")?.type).toBe("link");
        expect(result.rows.map((r) => r["score"].raw)).toEqual([0.75, 1]);
        expect(result.rows[0]["note.ref"]).toEqual({ kind: "link", display: "[[A]]", raw: "[[A]]" });
    });

    it("honours an explicitly declared cell type over inference", async () => {
        const run = (rows: PlainRow[]) =>
            rows.map((r) => ({ ...r, when: { value: "2026-01-01", type: "date" }, label: "x" }));
        const result = await runComputed(snap, run);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        // `when` is a string, but declared a date → typed as date, not inferred as category.
        expect(result.fields.find((f) => f.id === "when")?.type).toBe("date");
        // `label` is a plain string → inferred as category.
        expect(result.fields.find((f) => f.id === "label")?.type).toBe("category");
        expect(result.rows[0]["when"]).toEqual({ kind: "date", display: "2026-01-01", raw: "2026-01-01" });
    });

    it("passes through unchanged when no new column is added (AC-7)", async () => {
        const result = await runComputed(snap, (rows) => rows);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.fields.map((f) => f.id)).toEqual(["note.hours", "note.ref"]);
        expect(result.rows[0]["note.ref"]).toEqual(snap.rows[0]["note.ref"]);
    });

    it("fails safe when the script throws or rejects (AC-4)", async () => {
        expect(await runComputed(snap, () => { throw new Error("boom"); })).toEqual({ ok: false, error: "boom" });
        expect((await runComputed(snap, () => Promise.reject(new Error("async")))).ok).toBe(false);
    });

    it("fails safe when the script does not return an array", async () => {
        expect((await runComputed(snap, () => 42 as unknown)).ok).toBe(false);
    });

    it("(§XII) never mutates the source rows", async () => {
        await runComputed(snap, (rows) => {
            rows[0]["note.hours"] = 999;
            return rows.map((r) => ({ ...r, extra: 1 }));
        });
        expect(snap.rows[0]["note.hours"].raw).toBe(6);
        expect(snap.rows[0]["extra"]).toBeUndefined();
    });
});
