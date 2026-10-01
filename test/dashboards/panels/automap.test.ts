import { describe, it, expect } from "@jest/globals";
import { suggestMapping } from "dashboards/panels";
import type { Schema } from "dashboards/datastore";

function schema(fields: { id: string; type: string }[]): Schema {
    const full = fields.map((f) => ({ id: f.id, name: f.id, type: f.type as never }));
    const byId: Record<string, (typeof full)[number]> = {};
    for (const field of full) byId[field.id] = field;
    return { fields: full, byId };
}

describe("auto-mapping suggestions (S2, §XIII)", () => {
    const s = schema([
        { id: "note.when", type: "date" },
        { id: "note.hours", type: "number" },
        { id: "note.mood", type: "category" },
    ]);

    it("suggests a numeric value + average for a stat", () => {
        expect(suggestMapping("stat", s)).toEqual({ value: "note.hours", aggregate: "avg" });
    });

    it("falls back to count when a stat has no number", () => {
        expect(suggestMapping("stat", schema([{ id: "note.mood", type: "category" }])))
            .toEqual({ aggregate: "count" });
    });

    it("prefers a date for the bar axis and a number for the series", () => {
        expect(suggestMapping("bar", s)).toEqual({ category: "note.when", series: ["note.hours"] });
    });

    it("uses a category for the axis when there is no date", () => {
        const noDate = schema([
            { id: "note.mood", type: "category" },
            { id: "note.hours", type: "number" },
        ]);
        expect(suggestMapping("bar", noDate)).toEqual({ category: "note.mood", series: ["note.hours"] });
    });
});
