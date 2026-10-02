/**
 * Base Dashboards — the panels barrel (epic #622, S2 #624).
 */
export * from "./types";
export * from "./registry";
export { aggregate, numericValues } from "./aggregate";
export { suggestMapping } from "./automap";
export { isMappingComplete } from "./validate";
export { buildChartTheme, CHART_THEME_VARS } from "./theme";
export type { ChartTheme } from "./theme";
export { buildStat } from "./stat/statOption";
export type { StatView } from "./stat/statOption";
export { buildBarOption } from "./bar/barOption";
export { buildLineOption } from "./line/lineOption";
export { buildScatterOption } from "./scatter/scatterOption";
export { buildPieOption } from "./pie/pieOption";
export { buildHeatmapMatrixOption } from "./heatmap/heatmapOption";
export { buildTable, sortTable } from "./table/tableModel";
export type { TableColumn, TableModel } from "./table/tableModel";
export { calendarCounts, calendarGrid } from "./calendar/calendarModel";
export { DEFAULT_LAYOUT, panelLayout, cycleWidth, cycleHeight, movePanel, placePanel, layoutClasses } from "./layout";
export { migrateDashboard } from "./migrate";
export { notesAtPoint, notesOnDay } from "./notesAt";
export { buildTaskView, fingerprint, isOpen, parseTaskLine, toggledLine, MAX_TASKS_SHOWN } from "./tasks/taskModel";
export type { ParsedTaskLine, TaskGroup, TaskItem, TaskShow, TaskView } from "./tasks/taskModel";
export type { ChartPoint } from "./notesAt";
