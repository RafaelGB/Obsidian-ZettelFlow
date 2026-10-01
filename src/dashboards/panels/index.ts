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
export { DEFAULT_LAYOUT, panelLayout, cycleWidth, cycleHeight, movePanel, layoutClasses } from "./layout";
