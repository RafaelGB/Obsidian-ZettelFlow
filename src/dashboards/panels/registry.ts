/**
 * The panel-type registry (pure): each type's label, icon and the channels it maps. Drives the
 * config form and auto-mapping. New types (S4) add one entry here.
 */
import type { FieldType } from "dashboards/datastore";
import type { PanelType } from "./types";

export type ChannelKey = "value" | "category" | "series";

export interface ChannelSpec {
    key: ChannelKey;
    /** i18n key for the channel label. */
    labelKey: string;
    /** Field types that make sense for this channel (used to rank suggestions + filter the picker). */
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

export const PANEL_TYPES: Record<PanelType, PanelTypeSpec> = {
    stat: {
        type: "stat",
        labelKey: "dashboard_panel_stat",
        icon: "hash",
        channels: [
            { key: "value", labelKey: "dashboard_channel_value", accepts: ["number"], required: true },
        ],
    },
    bar: {
        type: "bar",
        labelKey: "dashboard_panel_bar",
        icon: "bar-chart-3",
        channels: [
            {
                key: "category",
                labelKey: "dashboard_channel_category",
                accepts: ["category", "date", "boolean"],
                required: true,
            },
            {
                key: "series",
                labelKey: "dashboard_channel_series",
                accepts: ["number"],
                multiple: true,
                required: true,
            },
        ],
    },
};

export function panelTypeList(): PanelTypeSpec[] {
    return Object.values(PANEL_TYPES);
}
