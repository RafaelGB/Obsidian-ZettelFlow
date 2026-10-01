/**
 * Is a panel's mapping complete enough to render? Drives the "map a field" prompt vs the chart
 * (the negative/empty state, §XIV). Pure.
 */
import type { PanelMapping, PanelType } from "./types";

export function isMappingComplete(type: PanelType, mapping: PanelMapping): boolean {
    if (type === "stat") {
        return mapping.aggregate === "count" || Boolean(mapping.value);
    }
    if (type === "bar") {
        return Boolean(mapping.category) && Boolean(mapping.series && mapping.series.length > 0);
    }
    return false;
}
