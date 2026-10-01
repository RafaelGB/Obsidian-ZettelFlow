/**
 * Panel model for Base Dashboards (epic #622, S2 #624). Pure vocabulary — a panel is the product's
 * unit; it reads the shared `DataStoreSnapshot` and never re-queries the Base.
 */
export type PanelType = "stat" | "bar";

export type AggregateFn = "sum" | "avg" | "min" | "max" | "count";

/** Which property feeds which visual channel. */
export interface PanelMapping {
    /** Stat: the numeric field to aggregate (ignored when the aggregate is `count`). */
    value?: string;
    /** Stat: how to reduce the value field to one number. */
    aggregate?: AggregateFn;
    /** Bar: the category / x-axis field. */
    category?: string;
    /** Bar: one or more numeric series fields. */
    series?: string[];
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
}

/** The persisted dashboard: an ordered list of panels (layout arrives in S3). */
export interface DashboardModel {
    panels: PanelConfig[];
}

export function emptyDashboard(): DashboardModel {
    return { panels: [] };
}
