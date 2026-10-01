/**
 * The DOM half of the chart theme bridge (§XV): sample Obsidian's resolved CSS variables off a live
 * element and hand them to the pure `buildChartTheme`. Re-run on the workspace `css-change` event so
 * charts follow a light↔dark or theme switch.
 */
import { CHART_THEME_VARS, buildChartTheme, type ChartTheme } from "dashboards/panels";

export function readChartTheme(el: HTMLElement): ChartTheme {
    const style = getComputedStyle(el);
    const vars: Record<string, string> = {};
    for (const name of CHART_THEME_VARS) vars[name] = style.getPropertyValue(name);
    return buildChartTheme(vars);
}
