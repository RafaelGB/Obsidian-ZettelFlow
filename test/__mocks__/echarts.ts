/**
 * Minimal manual mock of ECharts for unit tests (epic #622).
 *
 * The pure panel-option builders import only `import type` from echarts (erased), so they never hit
 * this. It exists so that a test which transitively imports the DOM panel host (which registers and
 * inits ECharts) loads a harmless stub instead of the real, DOM-bound library under node jest.
 */
export function use(_features?: unknown): void { }

export function init(_el?: unknown, _theme?: unknown, _opts?: unknown): {
    setOption: (o: unknown) => void;
    resize: () => void;
    dispose: () => void;
    on: (event: string, handler: (params: unknown) => void) => void;
} {
    return { setOption() { }, resize() { }, dispose() { }, on() { } };
}

// Tree-shakeable members the host registers via `use([...])`.
export const BarChart = {};
export const LineChart = {};
export const ScatterChart = {};
export const PieChart = {};
export const HeatmapChart = {};
export const GridComponent = {};
export const TooltipComponent = {};
export const LegendComponent = {};
export const DatasetComponent = {};
export const VisualMapComponent = {};
export const CanvasRenderer = {};
