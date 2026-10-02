/**
 * Minimal manual mock of ECharts for unit tests (epic #622).
 *
 * The pure panel-option builders import only `import type` from echarts (erased), so they never hit
 * this. It exists so that a test which transitively imports the DOM panel host (which registers and
 * inits ECharts) loads a harmless stub instead of the real, DOM-bound library under node jest.
 */
export function use(_features?: unknown): void { }

export interface FakeChart {
    options: unknown[];
    handlers: Record<string, (params: unknown) => void>;
    disposed: boolean;
    setOption: (o: unknown) => void;
    resize: () => void;
    dispose: () => void;
    on: (event: string, handler: (params: unknown) => void) => void;
}

/** Every chart `init` created, newest last — so a test can read the option or fire a click. */
export const __charts: FakeChart[] = [];

export function init(_el?: unknown, _theme?: unknown, _opts?: unknown): FakeChart {
    const chart: FakeChart = {
        options: [],
        handlers: {},
        disposed: false,
        setOption(o: unknown) { chart.options.push(o); },
        resize() { },
        dispose() { chart.disposed = true; },
        on(event: string, handler: (params: unknown) => void) { chart.handlers[event] = handler; },
    };
    __charts.push(chart);
    return chart;
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
