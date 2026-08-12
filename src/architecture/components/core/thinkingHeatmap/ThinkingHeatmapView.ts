import { ItemView, WorkspaceLeaf } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { DevelopmentJournal } from "architecture/plugin";
import { buildHeatmapGrid, DayCell } from "architecture/knowledge/journal/heatmap";

type ViewState = "ready" | "empty" | "error";

/**
 * A GitHub-style calendar heatmap of *ideas developed* over the last 52 weeks (#162), read from the
 * privacy-safe per-day development-event tally. Intensity is a CSS class per cell (`--l0…--l4`) — no
 * inline styles — and every cell is keyboard-focusable with a descriptive `aria-label` (AC-2).
 */
export class ThinkingHeatmapView extends ItemView {
    static readonly NAME = "zettelflow-thinking-heatmap";

    private state: ViewState = "empty";
    private cells: DayCell[] = [];
    private total = 0;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return ThinkingHeatmapView.NAME;
    }

    getDisplayText(): string {
        return t("thinking_heatmap_view_title");
    }

    getIcon(): string {
        return "calendar-days";
    }

    async onOpen(): Promise<void> {
        this.recompute();
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
    }

    private recompute(): void {
        try {
            const counts = DevelopmentJournal.getInstance().dailyCounts();
            const grid = buildHeatmapGrid(counts, Date.now());
            this.cells = grid.cells;
            this.total = grid.total;
            this.state = grid.total === 0 ? "empty" : "ready";
        } catch (error) {
            this.state = "error";
            log.error(`[ThinkingHeatmap] build failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
        this.render();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        const container = contentEl.createDiv({ cls: c("thinking-heatmap") });

        const header = container.createDiv({ cls: c("thinking-heatmap-header") });
        header.createEl("h4", { text: t("thinking_heatmap_view_title"), cls: c("thinking-heatmap-title") });
        const refresh = header.createEl("button", {
            text: t("thinking_heatmap_refresh_button"),
            cls: c("thinking-heatmap-refresh"),
            attr: { "aria-label": t("thinking_heatmap_refresh_button") },
        });
        this.registerDomEvent(refresh, "click", () => this.recompute());

        if (this.state === "error") {
            container.createDiv({ cls: c("thinking-heatmap-status"), text: t("thinking_heatmap_error") });
            return;
        }
        if (this.state === "empty") {
            container.createDiv({ cls: c("thinking-heatmap-status"), text: t("thinking_heatmap_empty") });
            return;
        }

        container.createDiv({ cls: c("thinking-heatmap-summary"), text: t("thinking_heatmap_summary", String(this.total)) });
        this.renderGrid(container);
        this.renderLegend(container);
    }

    private renderGrid(container: HTMLElement): void {
        // A labeled group of per-day images: each cell is announced (role="img" + aria-label) but is
        // not a tab stop — 364 tab stops would be a keyboard burden, and per-cell labels + the group
        // label make it screen-reader legible without a contradictory atomic role on the grid.
        const grid = container.createDiv({ cls: c("thinking-heatmap-grid") });
        grid.setAttribute("role", "group");
        grid.setAttribute("aria-label", t("thinking_heatmap_view_title"));
        const weeks = Math.ceil(this.cells.length / 7);
        for (let week = 0; week < weeks; week++) {
            const column = grid.createDiv({ cls: c("thinking-heatmap-col") });
            for (let day = 0; day < 7; day++) {
                const cell = this.cells[week * 7 + day];
                if (!cell) continue;
                const el = column.createDiv({
                    cls: [c("thinking-heatmap-cell"), c(`thinking-heatmap-cell--l${cell.level}`)].join(" "),
                });
                const label = t("thinking_heatmap_cell_label", String(cell.count), cell.date);
                el.setAttribute("role", "img");
                el.setAttribute("aria-label", label);
                el.setAttribute("title", label);
            }
        }
    }

    private renderLegend(container: HTMLElement): void {
        const legend = container.createDiv({ cls: c("thinking-heatmap-legend") });
        legend.createSpan({ text: t("thinking_heatmap_legend_less"), cls: c("thinking-heatmap-legend-label") });
        for (let level = 0; level <= 4; level++) {
            legend.createDiv({
                cls: [c("thinking-heatmap-cell"), c(`thinking-heatmap-cell--l${level}`)].join(" "),
            });
        }
        legend.createSpan({ text: t("thinking_heatmap_legend_more"), cls: c("thinking-heatmap-legend-label") });
    }
}
