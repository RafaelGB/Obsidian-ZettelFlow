/**
 * One panel, rendered (epic #622). A child `Component` so it tears down with the view. Chart types
 * render through a tree-shaken ECharts instance; Stat, Table and Calendar render as plain DOM. The
 * pure builders (`dashboards/panels`) do the thinking; this is the DOM + chart host plus the
 * per-panel move/resize controls that drive the class-driven grid (S3).
 */
import { Component, setIcon, setTooltip } from "obsidian";
import { init, use, type EChartsType } from "echarts/core";
import { BarChart, HeatmapChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { t } from "architecture/lang";
import { c } from "architecture/styles/helper";
import type { DataStoreSnapshot } from "dashboards/datastore";
import {
    buildBarOption,
    buildHeatmapMatrixOption,
    buildLineOption,
    buildPieOption,
    buildScatterOption,
    buildStat,
    buildTable,
    calendarGrid,
    isMappingComplete,
    layoutClasses,
    PANEL_TYPES,
    panelLayout,
    sortTable,
    type ChartTheme,
    type PanelConfig,
} from "dashboards/panels";

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

type ChartOption = Parameters<EChartsType["setOption"]>[0];

function formatNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export interface PanelHostActions {
    edit: (config: PanelConfig) => void;
    remove: (config: PanelConfig) => void;
    move: (config: PanelConfig, dir: -1 | 1) => void;
    resize: (config: PanelConfig) => void;
}

export class PanelHost extends Component {
    private cardEl: HTMLElement | null = null;
    private titleEl: HTMLElement | null = null;
    private bodyEl: HTMLElement | null = null;
    private chart: EChartsType | null = null;
    private tableSort: { column: number; dir: 1 | -1 } | null = null;

    constructor(
        private readonly parentEl: HTMLElement,
        public config: PanelConfig,
        private readonly actions: PanelHostActions,
    ) {
        super();
    }

    onload(): void {
        const card = this.parentEl.createDiv({ cls: c("base-dashboard-panel") });
        this.cardEl = card;
        const header = card.createDiv({ cls: c("base-dashboard-panel-header") });
        this.titleEl = header.createSpan({ cls: c("base-dashboard-panel-title") });
        const actions = header.createDiv({ cls: c("base-dashboard-panel-actions") });

        this.iconButton(actions, "chevron-left", t("dashboard_move_left"), () => this.actions.move(this.config, -1));
        this.iconButton(actions, "chevron-right", t("dashboard_move_right"), () => this.actions.move(this.config, 1));
        this.iconButton(actions, "move-horizontal", t("dashboard_resize"), () => this.actions.resize(this.config));
        this.iconButton(actions, "settings-2", t("dashboard_edit_panel"), () => this.actions.edit(this.config));
        this.iconButton(actions, "trash-2", t("dashboard_remove_panel"), () => this.actions.remove(this.config));

        this.bodyEl = card.createDiv({ cls: c("base-dashboard-panel-body") });
        this.registerDomEvent(window, "resize", () => this.chart?.resize());
    }

    private iconButton(parent: HTMLElement, icon: string, tooltip: string, onClick: () => void): void {
        const button = parent.createEl("button", { cls: "clickable-icon" });
        setIcon(button, icon);
        setTooltip(button, tooltip);
        this.registerDomEvent(button, "click", onClick);
    }

    setConfig(config: PanelConfig): void {
        this.config = config;
    }

    /** Move this panel's card to the end of its parent — used to re-order the grid in model order. */
    orderInto(parent: HTMLElement): void {
        if (this.cardEl) parent.appendChild(this.cardEl);
    }

    update(snapshot: DataStoreSnapshot, theme: ChartTheme): void {
        const card = this.cardEl;
        const body = this.bodyEl;
        if (!card || !body || !this.titleEl) return;

        card.className = [c("base-dashboard-panel"), ...layoutClasses(panelLayout(this.config))].join(" ");
        this.titleEl.setText(
            this.config.title ?? t(PANEL_TYPES[this.config.type].labelKey as Parameters<typeof t>[0]),
        );

        if (!isMappingComplete(this.config.type, this.config.mapping)) {
            this.disposeChart();
            body.empty();
            body.createDiv({ cls: c("base-dashboard-panel-empty"), text: t("dashboard_panel_unmapped") });
            return;
        }

        switch (this.config.type) {
            case "stat":
                this.renderStat(snapshot, body);
                return;
            case "table":
                this.renderTable(snapshot, body);
                return;
            case "calendar":
                this.renderCalendar(snapshot, body);
                return;
            default:
                this.renderChart(body, this.chartOption(snapshot, theme));
        }
    }

    private chartOption(snapshot: DataStoreSnapshot, theme: ChartTheme): ChartOption {
        switch (this.config.type) {
            case "bar":
                return buildBarOption(snapshot, this.config, theme);
            case "line":
                return buildLineOption(snapshot, this.config, theme, false);
            case "area":
                return buildLineOption(snapshot, this.config, theme, true);
            case "scatter":
                return buildScatterOption(snapshot, this.config, theme, false);
            case "bubble":
                return buildScatterOption(snapshot, this.config, theme, true);
            case "pie":
                return buildPieOption(snapshot, this.config, theme, false);
            case "donut":
                return buildPieOption(snapshot, this.config, theme, true);
            case "heatmap":
                return buildHeatmapMatrixOption(snapshot, this.config, theme);
            default:
                return {};
        }
    }

    private renderStat(snapshot: DataStoreSnapshot, body: HTMLElement): void {
        this.disposeChart();
        body.empty();
        const stat = buildStat(snapshot, this.config);
        const tile = body.createDiv({ cls: c("base-dashboard-stat") });
        tile.createDiv({ cls: c("base-dashboard-stat-value"), text: formatNumber(stat.value) });
        tile.createDiv({ cls: c("base-dashboard-stat-label"), text: stat.label });
    }

    private renderTable(snapshot: DataStoreSnapshot, body: HTMLElement): void {
        this.disposeChart();
        body.empty();
        let model = buildTable(snapshot, this.config);
        if (this.tableSort) model = sortTable(model, this.tableSort.column, this.tableSort.dir);

        const wrap = body.createDiv({ cls: c("base-dashboard-table-wrap") });
        const table = wrap.createEl("table", { cls: c("base-dashboard-table") });
        const head = table.createEl("thead").createEl("tr");
        model.columns.forEach((column, index) => {
            const th = head.createEl("th", { text: column.name });
            this.registerDomEvent(th, "click", () => {
                const dir: 1 | -1 = this.tableSort?.column === index && this.tableSort.dir === 1 ? -1 : 1;
                this.tableSort = { column: index, dir };
                this.renderTable(snapshot, body);
            });
        });
        const tbody = table.createEl("tbody");
        for (const row of model.rows) {
            const tr = tbody.createEl("tr");
            for (const cell of row) tr.createEl("td", { text: cell });
        }
    }

    private renderCalendar(snapshot: DataStoreSnapshot, body: HTMLElement): void {
        this.disposeChart();
        body.empty();
        const grid = calendarGrid(snapshot, this.config, Date.now());
        const cal = body.createDiv({ cls: c("base-dashboard-cal") });
        for (const cell of grid.cells) {
            const dayEl = cal.createDiv({ cls: `${c("base-dashboard-cal-cell")} is-l${cell.level}` });
            setTooltip(dayEl, `${cell.date}: ${cell.count}`);
        }
    }

    private renderChart(body: HTMLElement, option: ChartOption): void {
        if (!this.chart) {
            body.empty();
            this.chart = init(body, undefined, { renderer: "canvas" });
        }
        this.chart.setOption(option, true);
        this.chart.resize();
    }

    private disposeChart(): void {
        if (this.chart) {
            this.chart.dispose();
            this.chart = null;
        }
    }

    onunload(): void {
        this.disposeChart();
        this.cardEl?.remove();
        this.cardEl = null;
        this.titleEl = null;
        this.bodyEl = null;
    }
}
