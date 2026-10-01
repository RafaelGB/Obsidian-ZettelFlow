import { describe, it, expect } from "@jest/globals";
import { normalize } from "dashboards/datastore";
import type { AdaptedEntry, FieldDescriptor } from "dashboards/datastore";
import {
    buildHeatmapMatrixOption,
    buildLineOption,
    buildPieOption,
    buildScatterOption,
    buildTable,
    calendarCounts,
    calendarGrid,
    buildChartTheme,
    isMappingComplete,
    sortTable,
    suggestMapping,
    type PanelConfig,
} from "dashboards/panels";

const props: FieldDescriptor[] = [
    { id: "note.day", name: "Day" },
    { id: "note.a", name: "A" },
    { id: "note.b", name: "B" },
    { id: "note.cat", name: "Cat" },
];

function entry(day: string, a: number, b: number, cat: string): AdaptedEntry {
    return {
        path: `${day}-${cat}.md`,
        cells: {
            "note.day": { kind: "date", display: day, raw: day },
            "note.a": { kind: "number", display: String(a), raw: a },
            "note.b": { kind: "number", display: String(b), raw: b },
            "note.cat": { kind: "category", display: cat, raw: cat },
        },
    };
}

const snap = normalize(
    [entry("2026-01-01", 3, 4, "x"), entry("2026-01-01", 5, 2, "y"), entry("2026-01-02", 1, 1, "x")],
    props,
    "sig",
);
const theme = buildChartTheme({});
const cfg = (type: PanelConfig["type"], mapping: PanelConfig["mapping"]): PanelConfig => ({ id: "p", type, mapping });

/* eslint-disable @typescript-eslint/no-explicit-any */
describe("chart catalogue (S4)", () => {
    it("line maps a category axis + numeric series", () => {
        const o = buildLineOption(snap, cfg("line", { category: "note.cat", series: ["note.a"] }), theme, false) as any;
        expect(o.xAxis.data).toEqual(["x", "y", "x"]);
        expect(o.series[0].type).toBe("line");
        expect(o.series[0].data).toEqual([3, 5, 1]);
        expect(o.series[0].areaStyle).toBeUndefined();
    });

    it("area is a line with a fill", () => {
        const o = buildLineOption(snap, cfg("area", { category: "note.cat", series: ["note.a"] }), theme, true) as any;
        expect(o.series[0].areaStyle).toBeDefined();
    });

    it("scatter plots x/y points", () => {
        const o = buildScatterOption(snap, cfg("scatter", { x: "note.a", y: "note.b" }), theme, false) as any;
        expect(o.series[0].type).toBe("scatter");
        expect(o.series[0].data).toHaveLength(3);
    });

    it("bubble adds a colour visualMap", () => {
        const o = buildScatterOption(
            snap,
            cfg("bubble", { x: "note.a", y: "note.b", size: "note.a", color: "note.b" }),
            theme,
            true,
        ) as any;
        expect(o.visualMap).toBeDefined();
        expect(o.visualMap.dimension).toBe(3);
    });

    it("pie / donut build name+value slices", () => {
        const o = buildPieOption(snap, cfg("pie", { category: "note.cat", value: "note.a" }), theme, false) as any;
        expect(o.series[0].type).toBe("pie");
        expect(o.series[0].data[0]).toEqual({ name: "x", value: 3 });
        const d = buildPieOption(snap, cfg("donut", { category: "note.cat", value: "note.a" }), theme, true) as any;
        expect(Array.isArray(d.series[0].radius)).toBe(true);
    });

    it("heatmap builds a category x category grid", () => {
        const o = buildHeatmapMatrixOption(snap, cfg("heatmap", { x: "note.cat", y: "note.cat", value: "note.a" }), theme) as any;
        expect(o.series[0].type).toBe("heatmap");
        expect(o.xAxis.type).toBe("category");
    });

    it("table defaults to every field and sorts a column", () => {
        const model = buildTable(snap, cfg("table", {}));
        expect(model.columns.map((col) => col.id)).toEqual(["note.day", "note.a", "note.b", "note.cat"]);
        expect(model.rows).toHaveLength(3);
        const sorted = sortTable(model, 1, 1); // by A, ascending
        expect(sorted.rows.map((row) => row[1])).toEqual(["1", "3", "5"]);
    });

    it("calendar reuses buildHeatmapGrid: counts sum per day", () => {
        const config = cfg("calendar", { category: "note.day", value: "note.a" });
        expect(calendarCounts(snap, config)).toEqual({ "2026-01-01": 8, "2026-01-02": 1 });
        const grid = calendarGrid(snap, config, Date.parse("2026-01-03T00:00:00Z"), 26);
        expect(grid.cells.find((cell) => cell.date === "2026-01-01")?.count).toBe(8);
    });

    it("auto-maps the new types sensibly", () => {
        expect(suggestMapping("line", snap.schema)).toEqual({ category: "note.day", series: ["note.a"] });
        expect(suggestMapping("calendar", snap.schema)).toEqual({ category: "note.day", value: "note.a" });
        expect(suggestMapping("table", snap.schema).columns).toEqual(["note.day", "note.a", "note.b", "note.cat"]);
    });

    it("validates completeness per type", () => {
        expect(isMappingComplete("scatter", { x: "note.a", y: "note.b" })).toBe(true);
        expect(isMappingComplete("heatmap", { x: "note.cat", y: "note.cat", value: "note.a" })).toBe(true);
        expect(isMappingComplete("calendar", { category: "note.day" })).toBe(true);
        expect(isMappingComplete("table", {})).toBe(true);
        expect(isMappingComplete("scatter", { x: "note.a" })).toBe(false);
    });
});
