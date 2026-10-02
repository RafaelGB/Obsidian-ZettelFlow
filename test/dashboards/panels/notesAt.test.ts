import { describe, it, expect } from "@jest/globals";
import { normalize } from "dashboards/datastore";
import type { AdaptedEntry, FieldDescriptor } from "dashboards/datastore";
import { applyTransforms } from "dashboards/transform";
import { buildScatterOption, buildTable, notesAtPoint, notesOnDay, sortTable, type PanelConfig } from "dashboards/panels";

const props: FieldDescriptor[] = [
    { id: "note.date", name: "date" },
    { id: "note.hours", name: "hours" },
];
function day(path: string, date: string, hours: number | null): AdaptedEntry {
    return {
        path,
        cells: {
            "note.date": { kind: "date", display: date, raw: date },
            "note.hours":
                hours === null ? { kind: null, display: "", raw: null } : { kind: "number", display: String(hours), raw: hours },
        },
    };
}
const snap = normalize(
    [day("a.md", "2026-01-01", 6), day("b.md", "2026-01-02", null), day("c.md", "2026-01-02", 4)],
    props,
    "s",
);
const cfg = (type: PanelConfig["type"], mapping: PanelConfig["mapping"]): PanelConfig => ({ id: "p", type, mapping });
const theme = { text: "", axis: "", split: "", palette: ["", "", "", "", ""] };

describe("notes under a click (#632 UX)", () => {
    it("a per-row chart maps its data index to the row's note", () => {
        expect(notesAtPoint(snap, "bar", { dataIndex: 2 })).toEqual(["c.md"]);
    });

    it("scatter skips rows it cannot place, so it reads the hidden row index instead", () => {
        const option = buildScatterOption(snap, cfg("scatter", { x: "note.date", y: "note.hours" }), theme, false);
        const series = option.series as { data: number[][] }[];
        const second = series[0].data[1]; // b.md has no hours → dropped; the 2nd point is c.md
        expect(notesAtPoint(snap, "scatter", { dataIndex: 1, value: second })).toEqual(["c.md"]);
    });

    it("a calendar day lists every note on it", () => {
        expect(notesOnDay(snap, cfg("calendar", { category: "note.date" }), "2026-01-02")).toEqual(["b.md", "c.md"]);
    });

    it("a sorted table keeps each row with its note", () => {
        const model = sortTable(buildTable(snap, cfg("table", { columns: ["note.hours"] })), 0, 1);
        expect(model.rows.map((r) => r[0])).toEqual(["", "4", "6"]);
        expect(model.paths).toEqual(["b.md", "c.md", "a.md"]);
    });

    it("an aggregated row has no single note", () => {
        const grouped = applyTransforms(snap, [{ id: "g", type: "groupBy", field: "note.date", field2: "note.hours", aggregate: "sum" }]);
        expect(notesAtPoint(grouped, "bar", { dataIndex: 0 })).toEqual([]);
    });
});
