import { describe, it, expect } from "@jest/globals";
import { normalize, rowPath } from "dashboards/datastore";
import type { AdaptedEntry, FieldDescriptor, SchemaField } from "dashboards/datastore";
import { rowKeys, runComputed, toPlainRows } from "dashboards/transform";
import type { PlainRow } from "dashboards/transform";

const props: FieldDescriptor[] = [
    { id: "note.hours", name: "Hours" },
    { id: "note.ref", name: "Ref" },
];
function entry(hours: number | null, ref: string): AdaptedEntry {
    return {
        path: `${ref}.md`,
        cells: {
            "note.hours":
                hours === null
                    ? { kind: null, display: "", raw: null }
                    : { kind: "number", display: String(hours), raw: hours },
            "note.ref": { kind: "link", display: ref, raw: ref },
        },
    };
}
const snap = normalize([entry(6, "A"), entry(8, "B")], props, "sig");
// The usual Base: a field most notes carry, and one note that does not.
const sparse = normalize([entry(6, "A"), entry(null, "B"), entry(4, "C")], props, "sparse");

describe("computed fields — the row a script sees (#632)", () => {
    it("addresses a field by its short name and by its full id", () => {
        const [row] = toPlainRows(snap.rows, snap.schema.fields);
        expect(row.hours).toBe(6);
        expect(row["note.hours"]).toBe(6);
    });

    it("a field the note does not carry is undefined — never a fake 0", () => {
        const rows = toPlainRows(sparse.rows, sparse.schema.fields);
        expect(rows[1].hours).toBeUndefined();
        expect("hours" in rows[1]).toBe(true); // still listed, so `row.hours ?? 0` reads naturally
    });

    it("note properties win a short-name clash; the loser keeps only its full id", () => {
        const fields: SchemaField[] = [
            { id: "formula.score", name: "score", type: "number" },
            { id: "note.score", name: "score", type: "number" },
            { id: "file.name", name: "name", type: "category" },
        ];
        expect(rowKeys(fields)).toEqual([
            { id: "formula.score", key: "formula.score", type: "number" },
            { id: "note.score", key: "score", type: "number" },
            { id: "file.name", key: "name", type: "category" },
        ]);
    });
});

describe("computed fields — once per note (#632)", () => {
    it("adds the returned fields with their inferred type, keeping base cells (AC-2/AC-3)", async () => {
        const result = await runComputed(snap, (row) => ({ score: (row.hours as number) / 8 }));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.added).toEqual([{ id: "score", name: "score", type: "number" }]);
        expect(result.fields.find((f) => f.id === "note.ref")?.type).toBe("link");
        expect(result.rows.map((r) => r["score"].raw)).toEqual([0.75, 1]);
        expect(result.rows[0]["note.ref"]).toEqual({ kind: "link", display: "A", raw: "A" });
    });

    it("a missing input makes a missing output — NaN is stored as empty, not as a number", async () => {
        const result = await runComputed(sparse, (row) => ({ score: (row.hours as number) / 8 }));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.rows.map((r) => r["score"].raw)).toEqual([0.75, null, 0.5]);
        expect(result.rows[1]["score"]).toEqual({ kind: null, display: "", raw: null });
        expect(result.added[0].type).toBe("number"); // the empty cell does not muddy the type
        expect(result.skipped).toBe(0);
    });

    it("a note whose script throws is skipped, not the dashboard", async () => {
        const run = (row: PlainRow) => {
            if (row.hours === undefined) throw new Error("no hours");
            return { score: (row.hours as number) * 2 };
        };
        const result = await runComputed(sparse, run);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.rows.map((r) => r["score"].raw)).toEqual([12, null, 8]);
        expect(result.skipped).toBe(1);
        expect(result.warnings).toEqual([{ row: 1, message: "no hours" }]);
    });

    it("fails only when every note fails (AC-4)", async () => {
        expect(await runComputed(snap, () => { throw new Error("boom"); })).toEqual({ ok: false, error: "boom" });
        expect((await runComputed(snap, () => Promise.reject(new Error("async")))).ok).toBe(false);
    });

    it("returning nothing for a note leaves its new fields empty", async () => {
        const result = await runComputed(sparse, (row) => (row.hours === undefined ? undefined : { long: (row.hours as number) > 5 }));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.rows.map((r) => r["long"].raw)).toEqual([true, null, false]);
        expect(result.added[0].type).toBe("boolean");
    });

    it("a non-object return is reported, per note", async () => {
        const result = await runComputed(sparse, (row, index) => (index === 0 ? 42 : { x: row.hours }));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.skipped).toBe(1);
        expect(result.warnings[0].row).toBe(0);
    });

    it("honours an explicitly declared cell type over inference", async () => {
        const result = await runComputed(snap, () => ({ when: { value: "2026-01-01", type: "date" }, label: "x" }));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.fields.find((f) => f.id === "when")?.type).toBe("date");
        expect(result.fields.find((f) => f.id === "label")?.type).toBe("category");
        expect(result.rows[0]["when"]).toEqual({ kind: "date", display: "2026-01-01", raw: "2026-01-01" });
    });

    it("a declared value that is missing stays empty", async () => {
        const result = await runComputed(sparse, (row) => ({ h: { value: row.hours, type: "number" } }));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.rows[1]["h"].raw).toBeNull();
    });

    it("never overwrites a Base field — the name is ignored and warned about once", async () => {
        const result = await runComputed(snap, () => ({ hours: 0, "note.ref": "x", fresh: 1 }));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.added.map((f) => f.id)).toEqual(["fresh"]);
        expect(result.rows[0]["note.hours"].raw).toBe(6);
        expect(result.warnings.filter((w) => w.row === null)).toHaveLength(2);
    });

    it("hands the script its index and every row, for a field that needs neighbours", async () => {
        const result = await runComputed(snap, (row, index, rows) => ({
            delta: index === 0 ? undefined : (row.hours as number) - (rows[index - 1].hours as number),
        }));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.rows.map((r) => r["delta"].raw)).toEqual([null, 2]);
    });

    it("keeps each row's note path through the merge (so a click can open it)", async () => {
        const result = await runComputed(snap, () => ({ one: 1 }));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.rows.map((r) => rowPath(r))).toEqual(["A.md", "B.md"]);
    });

    it("(§XII) never mutates the source rows", async () => {
        await runComputed(snap, (row) => {
            row.hours = 999;
            return { extra: 1 };
        });
        expect(snap.rows[0]["note.hours"].raw).toBe(6);
        expect(snap.rows[0]["extra"]).toBeUndefined();
    });
});

describe("computed fields — the earlier rows => rows contract still works", () => {
    it("an array returned on the first call is taken as the whole result", async () => {
        let calls = 0;
        const result = await runComputed(snap, (_row, _index, rows) => {
            calls += 1;
            return rows.map((r) => ({ ...r, score: (r["note.hours"] as number) / 8 }));
        });
        expect(calls).toBe(1);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        // The short-name aliases the script was handed are not mistaken for new fields.
        expect(result.added.map((f) => f.id)).toEqual(["score"]);
        expect(result.rows.map((r) => r["score"].raw)).toEqual([0.75, 1]);
    });
});
