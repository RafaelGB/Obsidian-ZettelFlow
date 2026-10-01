/**
 * Is a panel's mapping complete enough to render? Drives the "map a field" prompt vs the chart
 * (the negative/empty state, §XIV). Pure.
 */
import type { PanelMapping, PanelType } from "./types";

export function isMappingComplete(type: PanelType, mapping: PanelMapping): boolean {
    switch (type) {
        case "stat":
            return mapping.aggregate === "count" || Boolean(mapping.value);
        case "bar":
        case "line":
        case "area":
            return Boolean(mapping.category) && Boolean(mapping.series && mapping.series.length > 0);
        case "pie":
        case "donut":
            return Boolean(mapping.category) && Boolean(mapping.value);
        case "scatter":
        case "bubble":
            return Boolean(mapping.x) && Boolean(mapping.y);
        case "heatmap":
            return Boolean(mapping.x) && Boolean(mapping.y) && Boolean(mapping.value);
        case "calendar":
            return Boolean(mapping.category);
        case "table":
            return true;
    }
}
