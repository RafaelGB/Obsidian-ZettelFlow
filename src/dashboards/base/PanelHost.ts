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
import type { EChartsType } from "echarts/core";
import { log } from "architecture";
import { t, tCount } from "architecture/lang";
import { c } from "architecture/styles/helper";
import { rowPath, type DataStoreSnapshot } from "dashboards/datastore";
import { applyTransforms } from "dashboards/transform";
import {
    buildBarOption,
    buildHeatmapMatrixOption,
    buildLineOption,
    buildPieOption,
    buildScatterOption,
    buildStat,
    buildTable,
    buildTaskView,
    isOpen,
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
    type TaskItem,
    type TaskShow,
} from "dashboards/panels";

/** The charting library, loaded with the first chart and shared after that (see echartsRuntime). */
let echartsRuntime: Promise<typeof import("./echartsRuntime")> | null = null;
function loadECharts(): Promise<typeof import("./echartsRuntime")> {
    echartsRuntime ??= import("./echartsRuntime");
    return echartsRuntime;
}

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

/** What a Tasks panel needs from outside (#635): reading is always there, the rest only on the dashboard. */
export interface TaskPort {
    load: (paths: readonly string[]) => Promise<TaskItem[]>;
    /** Tick or untick; `false` when the note's line is no longer that task (nothing was written). */
    toggle?: (task: TaskItem) => Promise<boolean>;
    /** Open the note at the task's line. */
    openAt?: (task: TaskItem, evt: MouseEvent) => void;
}

export interface PanelHostOptions {
    /** The config modal's live preview: no header, no menu, nothing clickable. */
    preview?: boolean;
    tasks?: TaskPort;
}

function noteName(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/, "");
}

const EMPTY_TASKS: Record<TaskShow, Parameters<typeof t>[0]> = {
    open: "dashboard_tasks_none_open",
    done: "dashboard_tasks_none_done",
    all: "dashboard_tasks_none",
};

export class PanelHost extends Component {
    private cardEl: HTMLElement | null = null;
    private titleEl: HTMLElement | null = null;
    private bodyEl: HTMLElement | null = null;
    private chart: EChartsType | null = null;
    /** Bumped when the chart goes away, so a library load that finishes late draws nothing. */
    private chartGeneration = 0;
    private tableSort: { column: number; dir: 1 | -1 } | null = null;
    /** The data the panel last drew — what a chart click resolves its notes against. */
    private drawn: DataStoreSnapshot | null = null;
    /** Bumped per Tasks render, so an older (slower) read never paints over a newer one. */
    private taskRender = 0;
    /** Said once, on the next Tasks render: a toggle the note refused. */
    private taskNotice: string | null = null;

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
            case "tasks":
                void this.renderTasks(data, body);
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

    /**
     * The tasks of the notes this panel draws (#635), read from Obsidian's index. Asynchronous, so the
     * previous list stays on screen until the new one is ready (no flicker), and a newer render wins.
     */
    private async renderTasks(snapshot: DataStoreSnapshot, body: HTMLElement): Promise<void> {
        this.disposeChart();
        const port = this.options.tasks;
        const token = ++this.taskRender;
        if (!port) {
            body.empty();
            return;
        }
        // Coming from another type (or a first draw), say so at once rather than leaving the previous
        // panel on screen while the notes are read; an existing task list stays until the new one is ready.
        if (!body.querySelector(`.${c("base-dashboard-tasks")}`)) {
            body.empty();
            body.createDiv({ cls: c("base-dashboard-panel-empty"), text: t("dashboard_tasks_loading") });
        }
        const paths = [...new Set(snapshot.rows.map(rowPath).filter((path): path is string => Boolean(path)))];
        let items: TaskItem[];
        try {
            items = await port.load(paths);
        } catch (error) {
            log.error("Base dashboard could not read tasks", error);
            items = [];
        }
        // Superseded by a newer render, switched to another type meanwhile, or unloaded: paint nothing.
        if (token !== this.taskRender || this.config.type !== "tasks" || !this.bodyEl) return;

        const mapping = this.config.mapping;
        const show: TaskShow = mapping.taskShow ?? "open";
        const view = buildTaskView(items, paths, { show, group: mapping.taskGroup ?? true });
        body.empty();
        const panel = body.createDiv({ cls: c("base-dashboard-tasks") });
        const counts = panel.createDiv({ cls: c("base-dashboard-tasks-counts") });
        // The count says what you asked to see: open tasks count the open ones, and only "All" shows both.
        const open = tCount(view.open, "dashboard_tasks_open", String(view.open));
        const done = tCount(view.done, "dashboard_tasks_done", String(view.done));
        counts.setText(show === "open" ? open : show === "done" ? done : `${open} · ${done}`);
        if (this.taskNotice) panel.createDiv({ cls: `${c("base-dashboard-notice")} is-error`, text: this.taskNotice });
        this.taskNotice = null;

        if (view.groups.length === 0) {
            panel.createDiv({ cls: c("base-dashboard-panel-empty"), text: t(EMPTY_TASKS[show]) });
            return;
        }
        const list = panel.createDiv({ cls: c("base-dashboard-task-list") });
        for (const group of view.groups) {
            if (group.path) {
                const heading = list.createDiv({ cls: c("base-dashboard-task-note"), text: noteName(group.path) });
                if (this.interactive) {
                    heading.addClass("is-clickable");
                    this.actions?.previewNote(heading, group.path);
                    heading.addEventListener("click", (evt) => this.actions?.openNotes([group.path], evt));
                }
            }
            for (const task of group.tasks) this.renderTask(list, task, snapshot, body);
        }
        if (view.hidden > 0) {
            panel.createDiv({ cls: c("base-dashboard-muted"), text: tCount(view.hidden, "dashboard_tasks_more", String(view.hidden)) });
        }
    }

    private renderTask(list: HTMLElement, task: TaskItem, snapshot: DataStoreSnapshot, body: HTMLElement): void {
        const port = this.options.tasks;
        const row = list.createDiv({ cls: `${c("base-dashboard-task")} is-depth-${Math.min(task.depth, 4)}` });
        row.toggleClass("is-checked", !isOpen(task.mark));
        // Obsidian's own checkbox class and `data-task`, so the theme (and custom statuses) style it.
        row.setAttribute("data-task", task.mark);
        const box = row.createEl("input", { cls: "task-list-item-checkbox", attr: { type: "checkbox", "data-task": task.mark } });
        box.checked = !isOpen(task.mark);
        const canToggle = this.interactive && port?.toggle !== undefined;
        box.disabled = !canToggle;
        // Plain text, never Markdown: the dashboard renders nothing a note could inject.
        const text = row.createSpan({ cls: c("base-dashboard-task-text"), text: task.text });
        if (this.interactive && port?.openAt) {
            text.addClass("is-clickable");
            this.actions?.previewNote(text, task.path);
            text.addEventListener("click", (evt) => port.openAt?.(task, evt));
        }
        if (!canToggle || !port?.toggle) return;
        const toggle = port.toggle;
        box.addEventListener("change", () => {
            box.disabled = true;
            void toggle(task).then((ok) => {
                if (!ok) this.taskNotice = t("dashboard_tasks_changed");
                // Redraw from the index either way — the note is the truth, not the checkbox.
                void this.renderTasks(snapshot, body);
            });
        });
    }

    private renderChart(body: HTMLElement, option: ChartOption): void {
        if (this.chart) {
            this.chart.setOption(option, true);
            this.chart.resize();
            return;
        }
        // The first chart loads the library; a panel that is redrawn or closed meanwhile wins.
        const generation = ++this.chartGeneration;
        void loadECharts()
            .then(({ init }) => {
                if (generation !== this.chartGeneration) return;
                if (!this.chart) {
                    body.empty();
                    this.chart = init(body, undefined, { renderer: "canvas" });
                    if (this.interactive) {
                        this.chart.on("click", (params) =>
                            this.onChartClick(params as ChartPoint & { event?: { event?: MouseEvent } })
                        );
                    }
                }
                this.chart.setOption(option, true);
                this.chart.resize();
            })
            .catch((error: unknown) => log.error("[dashboards] could not load the charting library", error));
    }

    private onChartClick(params: ChartPoint & { event?: { event?: MouseEvent } }): void {
        const evt = params.event?.event;
        if (!this.drawn || !evt) return;
        const paths = notesAtPoint(this.drawn, this.config.type, params);
        if (paths.length > 0) this.actions?.openNotes(paths, evt);
    }

    private disposeChart(): void {
        this.chartGeneration++;
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
