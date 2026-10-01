import { describe, it, expect } from "@jest/globals";
import { normalize } from "dashboards/datastore";
import type { AdaptedEntry, FieldDescriptor } from "dashboards/datastore";
import { buildStat } from "dashboards/panels";

const props: FieldDescriptor[] = [{ id: "note.hours", name: "Hours" }];
function entry(h: number): AdaptedEntry {
    return { path: `${h}.md`, cells: { "note.hours": { kind: "number", display: String(h), raw: h } } };
}
const snap = normalize([entry(6), entry(8)], props, "sig");

describe("Stat panel (S2)", () => {
    it("averages by default and labels from the field name", () => {
        expect(buildStat(snap, { id: "p1", type: "stat", mapping: { value: "note.hours" } }))
            .toEqual({ value: 7, label: "Hours" });
    });

    it("honors the aggregate and a custom title", () => {
        expect(buildStat(snap, {
            id: "p1",
            type: "stat",
            title: "Total",
            mapping: { value: "note.hours", aggregate: "sum" },
        })).toEqual({ value: 14, label: "Total" });
    });
});
