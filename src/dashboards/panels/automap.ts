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

    if (type === "stat") {
        return numbers.length > 0 ? { value: numbers[0], aggregate: "avg" } : { aggregate: "count" };
    }
    // bar: prefer a date or category for the axis, a number for the series.
    const category = dates[0] ?? categories[0] ?? schema.fields[0]?.id;
    const series = numbers.slice(0, 1);
    return { category, series };
}
