/**
 * Panel model for Base Dashboards (epic #622, S2 #624). Pure vocabulary — a panel is the product's
 * unit; it reads the shared `DataStoreSnapshot` and never re-queries the Base.
 */
import type { TransformStep } from "dashboards/transform/types";

export type PanelType =
    | "stat"
    | "bar"
    | "line"
    | "area"
    | "scatter"
    | "bubble"
    | "pie"
    | "donut"
    | "table"
    | "heatmap"
    | "calendar"
    | "tasks";

export type AggregateFn = "sum" | "avg" | "min" | "max" | "count";

/** Which property feeds which visual channel. The keys match `ChannelKey` so the config form is generic. */
export interface PanelMapping {
    /** Stat/pie: the numeric field to aggregate / size the slice. */
    value?: string;
    /** Stat: how to reduce the value field to one number. */
    aggregate?: AggregateFn;
    /** Bar/line/area axis; pie slice name; calendar date field. */
    category?: string;
    /** Bar/line/area: one or more numeric series fields. */
    series?: string[];
    /** Scatter/bubble/heatmap x. */
    x?: string;
    /** Scatter/bubble/heatmap y. */
    y?: string;
    /** Bubble: the numeric field sizing each point. */
    size?: string;
    /** Bubble/heatmap: the numeric field driving colour. */
    color?: string;
    /** Table: the columns to show (defaults to every visible field). */
    columns?: string[];
    /** Tasks (#635): which tasks to list — open (default), done, or all. */
    taskShow?: "open" | "done" | "all";
    /** Tasks (#635): group the tasks under their note (default true). */
    taskGroup?: boolean;
}

/** A panel's place on the grid: width in columns (1–3) and height in rows (1–2). */
export interface PanelLayout {
    w: 1 | 2 | 3;
    h: 1 | 2;
}

export interface PanelConfig {
    id: string;
    type: PanelType;
    title?: string;
    mapping: PanelMapping;
    /** Grid placement (S3). Order on the grid is the array order in `DashboardModel.panels`. */
    layout?: PanelLayout;
    /** Per-panel transform pipeline (S5) — reshapes the data this panel draws, in memory only. */
    transforms?: TransformStep[];
    /**
     * Legacy per-panel script transformer (S6), superseded by dashboard-level
     * {@link DashboardModel.computed} (#632). Still **loaded** (folded in by `migrateDashboard`) so
     * old view config keeps working; no longer authored.
     */
    script?: ComputedFields;
}

/** A dashboard-level computed-field script (#632): one definition, used by every panel's schema. */
export interface ComputedFields {
    enabled: boolean;
    code: string;
}

/** The persisted dashboard: an ordered list of panels + optional dashboard-level computed fields. */
export interface DashboardModel {
    panels: PanelConfig[];
    /** Computed fields (#632): a `rows => rows` that enriches the shared snapshot for every panel. */
    computed?: ComputedFields;
}

export function emptyDashboard(): DashboardModel {
    return { panels: [] };
}
