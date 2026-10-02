/**
 * Which notes sit under a click (pure) — a chart is a way *into* the notes, not a picture of them.
 * Every chart builder emits one data item per row, in row order, except scatter/bubble (which drops
 * rows it cannot place and carries the row index as a hidden 5th dimension) and the calendar (a day
 * can hold several notes). Rows a transform aggregated have no single note and yield nothing.
 */
import { rowPath, type DataStoreSnapshot } from "dashboards/datastore";
import type { PanelConfig, PanelType } from "./types";

/** The part of an ECharts click event we read. */
export interface ChartPoint {
    dataIndex?: number;
    value?: unknown;
}

function pathsOf(snapshot: DataStoreSnapshot, indexes: number[]): string[] {
    const paths: string[] = [];
    for (const index of indexes) {
        const row = snapshot.rows[index];
        const path = row ? rowPath(row) : undefined;
        if (path && !paths.includes(path)) paths.push(path);
    }
    return paths;
}

export function notesAtPoint(snapshot: DataStoreSnapshot, type: PanelType, point: ChartPoint): string[] {
    if (type === "scatter" || type === "bubble") {
        const index: unknown = Array.isArray(point.value) ? (point.value as unknown[])[4] : undefined;
        return typeof index === "number" ? pathsOf(snapshot, [index]) : [];
    }
    return typeof point.dataIndex === "number" ? pathsOf(snapshot, [point.dataIndex]) : [];
}

/** The notes whose mapped date falls on `day` (`YYYY-MM-DD`) — a calendar cell's notes. */
export function notesOnDay(snapshot: DataStoreSnapshot, config: PanelConfig, day: string): string[] {
    const field = config.mapping.category;
    if (!field) return [];
    const indexes: number[] = [];
    snapshot.rows.forEach((row, index) => {
        const raw = row[field]?.raw;
        if (typeof raw === "string" && raw.slice(0, 10) === day) indexes.push(index);
    });
    return pathsOf(snapshot, indexes);
}
