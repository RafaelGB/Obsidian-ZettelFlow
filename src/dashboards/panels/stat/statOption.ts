/**
 * The Stat panel (pure): reduce the mapped numeric field to one number + a label. Rendered as a
 * DOM tile (no ECharts needed for a single value).
 */
import type { DataStoreSnapshot } from "dashboards/datastore";
import { aggregate } from "../aggregate";
import type { PanelConfig } from "../types";

export interface StatView {
    value: number;
    label: string;
}

export function buildStat(snapshot: DataStoreSnapshot, config: PanelConfig): StatView {
    const fn = config.mapping.aggregate ?? "avg";
    const value = aggregate(snapshot.rows, config.mapping.value, fn);
    const field = config.mapping.value ? snapshot.schema.byId[config.mapping.value] : undefined;
    const label = config.title ?? field?.name ?? "";
    return { value, label };
}
