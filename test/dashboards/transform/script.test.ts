import { describe, it, expect } from "@jest/globals";
import { normalize } from "dashboards/datastore";
import type { AdaptedEntry, FieldDescriptor } from "dashboards/datastore";
import { runScriptRows, toPlainRows } from "dashboards/transform";
import type { PlainRow } from "dashboards/transform";

const props: FieldDescriptor[] = [
    { id: "note.hours", name: "Hours" },
    { id: "note.cat", name: "Cat" },
];
function entry(hours: number, cat: string): AdaptedEntry {
    return {
        path: `${hours}.md`,
        cells: {
            "note.hours": { kind: "number", display: String(hours), raw: hours },
            "note.cat": { kind: "category", display: cat, raw: cat },
        },
    };
}
const snap = normalize([entry(6, "x"), entry(8, "y")], props, "sig");

describe("script transformer core (S6, level 3)", () => {
    it("passes plain value rows — only rows, no TaggedCell, no app/vault (AC-2)", () => {
        const plain = toPlainRows(snap.rows);
        expect(plain[0]).toEqual({ "note.hours": 6, "note.cat": "x" });
        expect(Object.keys(plain[0])).toEqual(["note.hours", "note.cat"]);
    });

    it("maps rows and re-tags the result, inferring field types", () => {
        const run = (rows: PlainRow[]) => rows.map((row) => ({ ...row, score: (row["note.hours"] as number) / 8 }));
        const result = runScriptRows(snap.rows, run);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.rows.map((row) => row["score"].raw)).toEqual([0.75, 1]);
        expect(result.fields.find((field) => field.id === "score")?.type).toBe("number");
    });

    it("fails safe when the script throws (AC-3)", () => {
        const result = runScriptRows(snap.rows, () => {
            throw new Error("boom");
        });
        expect(result).toEqual({ ok: false, error: "boom" });
    });

    it("fails safe when the script does not return an array", () => {
        const result = runScriptRows(snap.rows, () => 42 as unknown);
        expect(result.ok).toBe(false);
    });

    it("(§XII) never mutates the source rows", () => {
        runScriptRows(snap.rows, (rows) => {
            rows[0]["note.hours"] = 999;
            return rows;
        });
        expect(snap.rows[0]["note.hours"].raw).toBe(6);
    });
});
