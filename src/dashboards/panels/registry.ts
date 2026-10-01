/**
 * The panel-type registry (pure): each type's label, icon and the channels it maps. Drives the
 * config form and auto-mapping. A new type (S4 #626) is one entry here.
 */
import type { FieldType } from "dashboards/datastore";
import type { PanelType } from "./types";

export type ChannelKey = "value" | "category" | "series" | "x" | "y" | "size" | "color" | "columns";

export interface ChannelSpec {
    key: ChannelKey;
    /** i18n key for the channel label. */
    labelKey: string;
    /** Field types that make sense for this channel (ranks suggestions + filters the picker). */
    accepts: FieldType[];
    multiple?: boolean;
    required?: boolean;
}

export interface PanelTypeSpec {
    type: PanelType;
    labelKey: string;
    icon: string;
    channels: ChannelSpec[];
}

const ANY: FieldType[] = ["date", "number", "category", "boolean", "link", "unknown"];
const AXIS: FieldType[] = ["category", "date", "boolean"];

const NUMERIC = (key: ChannelKey, labelKey: string, required = false): ChannelSpec => ({
    key,
    labelKey,
    accepts: ["number"],
    required,
});

const CAT = (key: ChannelKey, labelKey: string, required = true): ChannelSpec => ({
    key,
    labelKey,
    accepts: AXIS,
    required,
});

const SERIES: ChannelSpec = {
    key: "series",
    labelKey: "dashboard_channel_series",
    accepts: ["number"],
    multiple: true,
    required: true,
};

export const PANEL_TYPES: Record<PanelType, PanelTypeSpec> = {
    stat: {
        type: "stat",
        labelKey: "dashboard_panel_stat",
        icon: "hash",
        channels: [NUMERIC("value", "dashboard_channel_value", true)],
    },
    bar: {
        type: "bar",
        labelKey: "dashboard_panel_bar",
        icon: "bar-chart-3",
        channels: [CAT("category", "dashboard_channel_category"), SERIES],
    },
    line: {
        type: "line",
        labelKey: "dashboard_panel_line",
        icon: "line-chart",
        channels: [CAT("category", "dashboard_channel_category"), SERIES],
    },
    area: {
        type: "area",
        labelKey: "dashboard_panel_area",
        icon: "area-chart",
        channels: [CAT("category", "dashboard_channel_category"), SERIES],
    },
    scatter: {
        type: "scatter",
        labelKey: "dashboard_panel_scatter",
        icon: "scatter-chart",
        channels: [NUMERIC("x", "dashboard_channel_x", true), NUMERIC("y", "dashboard_channel_y", true)],
    },
    bubble: {
        type: "bubble",
        labelKey: "dashboard_panel_bubble",
        icon: "circle-dot",
        channels: [
            { key: "x", labelKey: "dashboard_channel_x", accepts: ["number", "date"], required: true },
            NUMERIC("y", "dashboard_channel_y", true),
            NUMERIC("size", "dashboard_channel_size"),
            NUMERIC("color", "dashboard_channel_color"),
        ],
    },
    pie: {
        type: "pie",
        labelKey: "dashboard_panel_pie",
        icon: "pie-chart",
        channels: [
            { key: "category", labelKey: "dashboard_channel_category", accepts: AXIS, required: true },
            NUMERIC("value", "dashboard_channel_value", true),
        ],
    },
    donut: {
        type: "donut",
        labelKey: "dashboard_panel_donut",
        icon: "circle",
        channels: [
            { key: "category", labelKey: "dashboard_channel_category", accepts: AXIS, required: true },
            NUMERIC("value", "dashboard_channel_value", true),
        ],
    },
    table: {
        type: "table",
        labelKey: "dashboard_panel_table",
        icon: "table",
        channels: [{ key: "columns", labelKey: "dashboard_channel_columns", accepts: ANY, multiple: true }],
    },
    heatmap: {
        type: "heatmap",
        labelKey: "dashboard_panel_heatmap",
        icon: "grid-3x3",
        channels: [
            CAT("x", "dashboard_channel_x"),
            CAT("y", "dashboard_channel_y"),
            NUMERIC("value", "dashboard_channel_value", true),
        ],
    },
    calendar: {
        type: "calendar",
        labelKey: "dashboard_panel_calendar",
        icon: "calendar",
        channels: [
            { key: "category", labelKey: "dashboard_channel_date", accepts: ["date"], required: true },
            NUMERIC("value", "dashboard_channel_value"),
        ],
    },
};

export function panelTypeList(): PanelTypeSpec[] {
    return Object.values(PANEL_TYPES);
}
