/**
 * Calendar-heatmap panel (pure) — **reuses** the existing journal grid model
 * (`architecture/knowledge/journal/heatmap`) rather than inventing a parallel one (design by
 * subtraction, FR-3). It only turns Base rows into the day-key → count map that `buildHeatmapGrid`
 * already consumes. Epic #622, S4 #626.
 */
import { buildHeatmapGrid, type HeatmapGrid } from "architecture/knowledge/journal/heatmap";
import type { DataStoreSnapshot } from "dashboards/datastore";
import type { PanelConfig } from "../types";

/** Day-key (`YYYY-MM-DD`) → summed value (or row count) from the mapped date + optional value field. */
export function calendarCounts(snapshot: DataStoreSnapshot, config: PanelConfig): Record<string, number> {
    const dateField = config.mapping.category;
    const valueField = config.mapping.value;
    const counts: Record<string, number> = {};
    if (!dateField) return counts;

    for (const row of snapshot.rows) {
        const cell = row[dateField];
        if (!cell || cell.kind !== "date" || typeof cell.raw !== "string") continue;
        const day = cell.raw.slice(0, 10);
        if (!day) continue;
        const valueCell = valueField ? row[valueField] : undefined;
        const increment = valueField ? (typeof valueCell?.raw === "number" ? valueCell.raw : 0) : 1;
        counts[day] = (counts[day] ?? 0) + increment;
    }
    return counts;
}

export function calendarGrid(
    snapshot: DataStoreSnapshot,
    config: PanelConfig,
    now: number,
    weeks = 26,
): HeatmapGrid {
    return buildHeatmapGrid(calendarCounts(snapshot, config), now, weeks);
}
