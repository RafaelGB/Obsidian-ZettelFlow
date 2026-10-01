/**
 * One panel, rendered (epic #622, S2 #624). A child `Component` so it tears down with the view.
 * A Stat renders as a DOM tile; a Bar renders through a tree-shaken ECharts instance. The pure
 * option/value builders do the thinking (`dashboards/panels`); this is just the DOM + chart host.
 */
import { Component, setIcon, setTooltip } from "obsidian";
import { init, use, type EChartsType } from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { t } from "architecture/lang";
import { c } from "architecture/styles/helper";
import type { DataStoreSnapshot } from "dashboards/datastore";
import {
    buildBarOption,
    buildStat,
    isMappingComplete,
    PANEL_TYPES,
    type ChartTheme,
    type PanelConfig,
} from "dashboards/panels";

// Register only what the shipped panel types need (tree-shaking — never the whole library).
use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

function formatNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export class PanelHost extends Component {
    private cardEl: HTMLElement | null = null;
    private titleEl: HTMLElement | null = null;
    private bodyEl: HTMLElement | null = null;
    private chart: EChartsType | null = null;

    constructor(
        private readonly parentEl: HTMLElement,
        public config: PanelConfig,
        private readonly onEdit: (config: PanelConfig) => void,
        private readonly onRemove: (config: PanelConfig) => void,
    ) {
        super();
    }

    onload(): void {
        const card = this.parentEl.createDiv({ cls: c("base-dashboard-panel") });
        this.cardEl = card;
        const header = card.createDiv({ cls: c("base-dashboard-panel-header") });
        this.titleEl = header.createSpan({ cls: c("base-dashboard-panel-title") });
        const actions = header.createDiv({ cls: c("base-dashboard-panel-actions") });

        const edit = actions.createEl("button", { cls: "clickable-icon" });
        setIcon(edit, "settings-2");
        setTooltip(edit, t("dashboard_edit_panel"));
        this.registerDomEvent(edit, "click", () => this.onEdit(this.config));

        const remove = actions.createEl("button", { cls: "clickable-icon" });
        setIcon(remove, "trash-2");
        setTooltip(remove, t("dashboard_remove_panel"));
        this.registerDomEvent(remove, "click", () => this.onRemove(this.config));

        this.bodyEl = card.createDiv({ cls: c("base-dashboard-panel-body") });
        this.registerDomEvent(window, "resize", () => this.chart?.resize());
    }

    setConfig(config: PanelConfig): void {
        this.config = config;
    }

    update(snapshot: DataStoreSnapshot, theme: ChartTheme): void {
        const body = this.bodyEl;
        if (!body || !this.titleEl) return;
        this.titleEl.setText(this.config.title ?? t(PANEL_TYPES[this.config.type].labelKey as Parameters<typeof t>[0]));

        if (!isMappingComplete(this.config.type, this.config.mapping)) {
            this.disposeChart();
            body.empty();
            body.createDiv({ cls: c("base-dashboard-panel-empty"), text: t("dashboard_panel_unmapped") });
            return;
        }

        if (this.config.type === "stat") {
            this.renderStat(snapshot, body);
            return;
        }
        this.renderChart(body, buildBarOption(snapshot, this.config, theme));
    }

    private renderStat(snapshot: DataStoreSnapshot, body: HTMLElement): void {
        this.disposeChart();
        body.empty();
        const stat = buildStat(snapshot, this.config);
        const tile = body.createDiv({ cls: c("base-dashboard-stat") });
        tile.createDiv({ cls: c("base-dashboard-stat-value"), text: formatNumber(stat.value) });
        tile.createDiv({ cls: c("base-dashboard-stat-label"), text: stat.label });
    }

    private renderChart(body: HTMLElement, option: Parameters<EChartsType["setOption"]>[0]): void {
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
