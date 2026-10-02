/**
 * One panel, rendered (epic #622). A child `Component` so it tears down with the view. Chart types
 * render through a tree-shaken ECharts instance; Stat, Table and Calendar render as plain DOM. The
 * pure builders (`dashboards/panels`) do the thinking; this is the DOM + chart host.
 *
 * The card is quiet by design (#632 UX): a title and one "more" button. Everything you do *to* a
 * panel — edit, duplicate, move, size, remove — lives in Obsidian's native `Menu`, reached from that
 * button or a right-click anywhere on the card, the way a file or a tab behaves. Everything you do
 * *through* a panel goes to the notes: click a bar, a point, a slice, a table row or a calendar day
 * to open the note behind it (Mod-click for a new tab); hover a table row for a page preview.
 *
 * In `preview` mode (the config modal's live preview) there is no header and nothing is clickable.
 */
import { Component, Menu, setIcon, setTooltip } from "obsidian";
import { init, use, type EChartsType } from "echarts/core";
import { BarChart, HeatmapChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { t, tCount } from "architecture/lang";
import { c } from "architecture/styles/helper";
import type { DataStoreSnapshot } from "dashboards/datastore";
import { applyTransforms } from "dashboards/transform";
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
    notesAtPoint,
    notesOnDay,
    PANEL_TYPES,
    panelLayout,
    sortTable,
    type ChartPoint,
    type ChartTheme,
    type PanelConfig,
    type PanelLayout,
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

/** The drag payload type — our own, so a file or text dragged in from elsewhere is never mistaken for a panel. */
const PANEL_MIME = "application/x-zettelflow-panel";

function formatNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

const WIDTHS: PanelLayout["w"][] = [1, 2, 3];

export interface PanelHostActions {
    edit: (config: PanelConfig) => void;
    duplicate: (config: PanelConfig) => void;
    remove: (config: PanelConfig) => void;
    move: (config: PanelConfig, dir: -1 | 1) => void;
    canMove: (config: PanelConfig, dir: -1 | 1) => boolean;
    setLayout: (config: PanelConfig, layout: PanelLayout) => void;
    /** Drop the panel `id` before or after `target` — the end of a drag on the grid. */
    place: (id: string, target: PanelConfig, after: boolean) => void;
    /** Open the note(s) under a click — one opens directly, several offer a menu. */
    openNotes: (paths: string[], evt: MouseEvent) => void;
    /** Wire Obsidian's page preview to an element standing for one note. */
    previewNote: (el: HTMLElement, path: string) => void;
}

export interface PanelHostOptions {
    /** The config modal's live preview: no header, no menu, nothing clickable. */
    preview?: boolean;
}

export class PanelHost extends Component {
    private cardEl: HTMLElement | null = null;
    private titleEl: HTMLElement | null = null;
    private bodyEl: HTMLElement | null = null;
    private chart: EChartsType | null = null;
    private tableSort: { column: number; dir: 1 | -1 } | null = null;
    /** The data the panel last drew — what a chart click resolves its notes against. */
    private drawn: DataStoreSnapshot | null = null;

    constructor(
        private readonly parentEl: HTMLElement,
        public config: PanelConfig,
        private readonly actions: PanelHostActions | null,
        private readonly options: PanelHostOptions = {},
    ) {
        super();
    }

    private get interactive(): boolean {
        return !this.options.preview && this.actions !== null;
    }

    onload(): void {
        const card = this.parentEl.createDiv({ cls: c("base-dashboard-panel") });
        this.cardEl = card;
        if (this.interactive) {
            const header = card.createDiv({ cls: c("base-dashboard-panel-header") });
            this.titleEl = header.createSpan({ cls: c("base-dashboard-panel-title") });
            const more = header.createEl("button", {
                cls: `clickable-icon ${c("base-dashboard-panel-more")}`,
                attr: { "aria-label": t("dashboard_panel_options") },
            });
            setIcon(more, "more-horizontal");
            setTooltip(more, t("dashboard_panel_options"));
            this.registerDomEvent(more, "click", (evt) => this.showMenu(evt));
            this.registerDomEvent(card, "contextmenu", (evt) => {
                evt.preventDefault();
                this.showMenu(evt);
            });
            this.registerDomEvent(this.titleEl, "dblclick", () => this.actions?.edit(this.config));
            this.wireDrag(card, header);
        }
        this.bodyEl = card.createDiv({ cls: c("base-dashboard-panel-body") });
        // Follow the panel's own box, not the window: a sidebar toggle or a width change resizes it too.
        if (typeof ResizeObserver !== "undefined") {
            const observer = new ResizeObserver(() => this.chart?.resize());
            observer.observe(this.bodyEl);
            this.register(() => observer.disconnect());
        } else {
            this.registerDomEvent(window, "resize", () => this.chart?.resize());
        }
    }

    /**
     * Drag to reorder: the header is the handle (so dragging inside a chart still pans/brushes the
     * chart), the whole card is the drop target, and the drop lands before or after it depending on
     * which half you release over. Touch has no HTML drag — the menu's move items remain there.
     */
    private wireDrag(card: HTMLElement, header: HTMLElement): void {
        header.draggable = true;
        header.addClass(c("base-dashboard-panel-handle"));
        const clearMarks = (): void => card.removeClasses(["is-drop-before", "is-drop-after"]);

        this.registerDomEvent(header, "dragstart", (evt) => {
            if (!evt.dataTransfer) return;
            evt.dataTransfer.setData(PANEL_MIME, this.config.id);
            evt.dataTransfer.effectAllowed = "move";
            const box = card.getBoundingClientRect();
            evt.dataTransfer.setDragImage(card, evt.clientX - box.left, evt.clientY - box.top);
            card.addClass("is-dragging");
        });
        this.registerDomEvent(header, "dragend", () => card.removeClass("is-dragging"));
        this.registerDomEvent(card, "dragover", (evt) => {
            if (!evt.dataTransfer?.types.includes(PANEL_MIME) || card.hasClass("is-dragging")) return;
            evt.preventDefault();
            evt.dataTransfer.dropEffect = "move";
            const box = card.getBoundingClientRect();
            const after = evt.clientX > box.left + box.width / 2;
            card.toggleClass("is-drop-after", after);
            card.toggleClass("is-drop-before", !after);
        });
        this.registerDomEvent(card, "dragleave", (evt) => {
            if (!(evt.relatedTarget instanceof Node) || !card.contains(evt.relatedTarget)) clearMarks();
        });
        this.registerDomEvent(card, "drop", (evt) => {
            const id = evt.dataTransfer?.getData(PANEL_MIME);
            const after = card.hasClass("is-drop-after");
            clearMarks();
            if (!id) return;
            evt.preventDefault();
            this.actions?.place(id, this.config, after);
        });
    }

    /** Obsidian's own context menu — the same place a file's or a tab's actions live. */
    private showMenu(evt: MouseEvent): void {
        const actions = this.actions;
        if (!actions) return;
        const config = this.config;
        const layout = panelLayout(config);
        const menu = new Menu();
        menu.addItem((item) =>
            item.setTitle(t("dashboard_edit_panel")).setIcon("pencil").onClick(() => actions.edit(config)),
        );
        menu.addItem((item) =>
            item.setTitle(t("dashboard_duplicate_panel")).setIcon("copy").onClick(() => actions.duplicate(config)),
        );
        menu.addSeparator();
        menu.addItem((item) =>
            item
                .setTitle(t("dashboard_move_left"))
                .setIcon("arrow-left")
                .setDisabled(!actions.canMove(config, -1))
                .onClick(() => actions.move(config, -1)),
        );
        menu.addItem((item) =>
            item
                .setTitle(t("dashboard_move_right"))
                .setIcon("arrow-right")
                .setDisabled(!actions.canMove(config, 1))
                .onClick(() => actions.move(config, 1)),
        );
        menu.addSeparator();
        for (const w of WIDTHS) {
            menu.addItem((item) =>
                item
                    .setTitle(tCount(w, "dashboard_width_columns", String(w)))
                    .setChecked(layout.w === w)
                    .onClick(() => actions.setLayout(config, { ...layout, w })),
            );
        }
        menu.addItem((item) =>
            item
                .setTitle(t("dashboard_tall"))
                .setChecked(layout.h === 2)
                .onClick(() => actions.setLayout(config, { ...layout, h: layout.h === 2 ? 1 : 2 })),
        );
        menu.addSeparator();
        menu.addItem((item) =>
            item
                .setTitle(t("dashboard_remove_panel"))
                .setIcon("trash-2")
                .setWarning(true)
                .onClick(() => actions.remove(config)),
        );
        menu.showAtMouseEvent(evt);
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
        if (!card || !body) return;

        const classes = [c("base-dashboard-panel"), ...layoutClasses(panelLayout(this.config))];
        if (this.options.preview) classes.push("is-preview");
        card.className = classes.join(" ");
        this.titleEl?.setText(
            this.config.title ?? t(PANEL_TYPES[this.config.type].labelKey as Parameters<typeof t>[0]),
        );

        if (!isMappingComplete(this.config.type, this.config.mapping)) {
            this.disposeChart();
            this.drawn = null;
            body.empty();
            const empty = body.createDiv({ cls: c("base-dashboard-panel-empty") });
            empty.createDiv({ text: t("dashboard_panel_unmapped") });
            if (this.interactive) {
                const configure = empty.createEl("button", { text: t("dashboard_configure_panel") });
                configure.addEventListener("click", () => this.actions?.edit(this.config));
            }
            return;
        }

        // Elements below are rebuilt on every render, so they take plain listeners that are discarded
        // with them, rather than `registerDomEvent` closures that would pile up until unload.
        // Level-2 transforms reshape the data this panel draws — in memory only (§XII). Dashboard-level
        // computed fields (#632) already enriched `snapshot` before it reached here.
        const data = applyTransforms(snapshot, this.config.transforms ?? []);
        this.drawn = data;
        switch (this.config.type) {
            case "stat":
                this.renderStat(data, body);
                return;
            case "table":
                this.renderTable(data, body);
                return;
            case "calendar":
                this.renderCalendar(data, body);
                return;
            default:
                this.renderChart(body, this.chartOption(data, theme));
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
            if (this.tableSort?.column === index) {
                setIcon(th.createSpan({ cls: c("base-dashboard-sort-icon") }), this.tableSort.dir === 1 ? "arrow-up" : "arrow-down");
            }
            th.addEventListener("click", () => {
                const dir: 1 | -1 = this.tableSort?.column === index && this.tableSort.dir === 1 ? -1 : 1;
                this.tableSort = { column: index, dir };
                this.renderTable(snapshot, body);
            });
        });
        const tbody = table.createEl("tbody");
        model.rows.forEach((row, index) => {
            const tr = tbody.createEl("tr");
            for (const cell of row) tr.createEl("td", { text: cell });
            const path = model.paths[index];
            if (!path || !this.interactive) return;
            tr.addClass("is-clickable");
            this.actions?.previewNote(tr, path);
            tr.addEventListener("click", (evt) => this.actions?.openNotes([path], evt));
        });
    }

    private renderCalendar(snapshot: DataStoreSnapshot, body: HTMLElement): void {
        this.disposeChart();
        body.empty();
        const grid = calendarGrid(snapshot, this.config, Date.now());
        const cal = body.createDiv({ cls: c("base-dashboard-cal") });
        for (const cell of grid.cells) {
            const dayEl = cal.createDiv({ cls: `${c("base-dashboard-cal-cell")} is-l${cell.level}` });
            setTooltip(dayEl, `${cell.date}: ${cell.count}`);
            if (!this.interactive || cell.count === 0) continue;
            dayEl.addClass("is-clickable");
            dayEl.addEventListener("click", (evt) =>
                this.actions?.openNotes(notesOnDay(snapshot, this.config, cell.date), evt),
            );
        }
    }

    private renderChart(body: HTMLElement, option: ChartOption): void {
        if (!this.chart) {
            body.empty();
            this.chart = init(body, undefined, { renderer: "canvas" });
            if (this.interactive) {
                this.chart.on("click", (params) => this.onChartClick(params as ChartPoint & { event?: { event?: MouseEvent } }));
            }
        }
        this.chart.setOption(option, true);
        this.chart.resize();
    }

    private onChartClick(params: ChartPoint & { event?: { event?: MouseEvent } }): void {
        const evt = params.event?.event;
        if (!this.drawn || !evt) return;
        const paths = notesAtPoint(this.drawn, this.config.type, params);
        if (paths.length > 0) this.actions?.openNotes(paths, evt);
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
        this.drawn = null;
    }
}
