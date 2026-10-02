import { describe, it, expect } from "@jest/globals";
import { normalize } from "dashboards/datastore";
import type { AdaptedEntry, FieldDescriptor } from "dashboards/datastore";
import { applyTransforms } from "dashboards/transform";
import { buildStat } from "dashboards/panels";

const props: FieldDescriptor[] = [
    { id: "note.date", name: "date" },
    { id: "note.hours", name: "hours" },
];
function day(date: string, hours: number): AdaptedEntry {
    return {
        path: `${date}.md`,
        cells: {
            "note.date": { kind: "date", display: date, raw: date },
            "note.hours": { kind: "number", display: String(hours), raw: hours },
        },
    };
}
const snap = normalize(
    [day("2026-09-20", 2), day("2026-09-26", 6), day("2026-09-30", 8), day("2026-10-02", 4), day("2026-10-05", 9)],
    props,
    "s",
);
// Noon on 2026-10-02 local time — a fixed "today".
const NOW = new Date(2026, 9, 2, 12).getTime();

describe("date filters (#632 follow-up)", () => {
    it("'last 7 days' keeps today and the six days before it, nothing in the future", () => {
        const out = applyTransforms(snap, [{ id: "f", type: "filter", field: "note.date", op: "lastDays", value: "7" }], NOW);
        expect(out.rows.map((r) => r["note.date"].raw)).toEqual(["2026-09-26", "2026-09-30", "2026-10-02"]);
    });

    it("answers 'average hours over the last week' as a Stat + one filter", () => {
        const out = applyTransforms(snap, [{ id: "f", type: "filter", field: "note.date", op: "lastDays", value: "7" }], NOW);
        const stat = buildStat(out, { id: "p", type: "stat", mapping: { value: "note.hours", aggregate: "avg" } });
        expect(stat.value).toBe(6);
    });

    it("a nonsense window keeps nothing rather than everything", () => {
        const out = applyTransforms(snap, [{ id: "f", type: "filter", field: "note.date", op: "lastDays", value: "abc" }], NOW);
        expect(out.rowCount).toBe(0);
    });

    it("> and < compare dates as dates", () => {
        const out = applyTransforms(snap, [{ id: "f", type: "filter", field: "note.date", op: "gte", value: "2026-09-30" }], NOW);
        expect(out.rows.map((r) => r["note.date"].raw)).toEqual(["2026-09-30", "2026-10-02", "2026-10-05"]);
    });
});
