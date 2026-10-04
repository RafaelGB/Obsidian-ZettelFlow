/**
 * The charting library, registered once (epic #622) — and only when a dashboard draws its first
 * chart. ECharts is the largest thing the plugin carries after the 3D graph; imported statically it
 * was evaluated on every Obsidian start, by everyone, whether or not they ever open a dashboard.
 * `PanelHost` reaches it through a dynamic import, so the cost moves to the first chart instead.
 */
import { init, use } from "echarts/core";
import { BarChart, HeatmapChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

// Register only what the shipped panel types need (tree-shaking — never the whole library).
use([
    BarChart,
    LineChart,
    ScatterChart,
    PieChart,
    HeatmapChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    VisualMapComponent,
    CanvasRenderer,
]);

export { init };
