import { describe, it, expect } from "@jest/globals";
import { normalize } from "dashboards/datastore";
import type { AdaptedEntry, FieldDescriptor } from "dashboards/datastore";
import { buildBarOption, buildChartTheme } from "dashboards/panels";

const props: FieldDescriptor[] = [
    { id: "note.day", name: "Day" },
    { id: "note.mood", name: "Mood" },
    { id: "note.focus", name: "Focus" },
];
function entry(day: string, mood: number, focus: number): AdaptedEntry {
    return {
        path: `${day}.md`,
        cells: {
            "note.day": { kind: "category", display: day, raw: day },
            "note.mood": { kind: "number", display: String(mood), raw: mood },
            "note.focus": { kind: "number", display: String(focus), raw: focus },
        },
    };
}
const snap = normalize([entry("Mon", 3, 4), entry("Tue", 5, 2)], props, "sig");
const theme = buildChartTheme({});

describe("Bar panel option (S2)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const option = buildBarOption(snap, {
        id: "p1",
        type: "bar",
        mapping: { category: "note.day", series: ["note.mood", "note.focus"] },
    }, theme) as any;

    it("uses the category field for the x axis", () => {
        expect(option.xAxis.type).toBe("category");
        expect(option.xAxis.data).toEqual(["Mon", "Tue"]);
    });

    it("emits one bar series per mapped series field, with numeric data", () => {
        expect(option.series).toHaveLength(2);
        expect(option.series[0].type).toBe("bar");
        expect(option.series[0].name).toBe("Mood");
        expect(option.series[0].data).toEqual([3, 5]);
        expect(option.series[1].data).toEqual([4, 2]);
    });

    it("colours each series from the theme palette", () => {
        expect(option.series[0].itemStyle.color).toBe(theme.palette[0]);
        expect(option.series[1].itemStyle.color).toBe(theme.palette[1]);
    });
});
