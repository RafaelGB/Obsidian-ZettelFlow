/**
 * Auto-mapping (pure, §XIII working defaults): given the inferred schema, propose a mapping that
 * renders without the user having to think about axes. A date → x, a number → y/value, etc.
 */
import type { FieldType, Schema } from "dashboards/datastore";
import type { PanelMapping, PanelType } from "./types";

function idsOfType(schema: Schema, type: FieldType): string[] {
    return schema.fields.filter((field) => field.type === type).map((field) => field.id);
}

export function suggestMapping(type: PanelType, schema: Schema): PanelMapping {
    const numbers = idsOfType(schema, "number");
    const dates = idsOfType(schema, "date");
    const categories = [...idsOfType(schema, "category"), ...idsOfType(schema, "boolean")];
    const axis = dates[0] ?? categories[0] ?? schema.fields[0]?.id;

    switch (type) {
        case "stat":
            return numbers.length > 0 ? { value: numbers[0], aggregate: "avg" } : { aggregate: "count" };
        case "bar":
        case "line":
        case "area":
            return { category: axis, series: numbers.slice(0, 1) };
        case "pie":
        case "donut":
            return { category: categories[0] ?? axis, value: numbers[0] };
        case "scatter":
            return { x: numbers[0], y: numbers[1] ?? numbers[0] };
        case "bubble":
            return { x: dates[0] ?? numbers[0], y: numbers[0], size: numbers[1], color: numbers[2] ?? numbers[1] };
        case "heatmap":
            return { x: categories[0] ?? axis, y: categories[1] ?? categories[0], value: numbers[0] };
        case "calendar":
            return { category: dates[0], value: numbers[0] };
        case "table":
            return { columns: schema.fields.slice(0, 4).map((field) => field.id) };
        case "tasks":
            return { taskShow: "open", taskGroup: true };
    }
}
