import { c, log } from "architecture";
import { t } from "architecture/lang";
import { DevelopmentJournal } from "architecture/plugin";
import { buildHeatmapGrid, DayCell } from "architecture/knowledge/state";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";

type ViewState = "ready" | "empty" | "error";

/**
 * The **Momentum** mode of the Health surface (#272) — a GitHub-style calendar heatmap of *ideas
 * developed* over the last 52 weeks (#162), read from the privacy-safe per-day development-event
 * tally. Intensity is a CSS class per cell (`--l0…--l4`) — no inline styles — and every cell is
 * keyboard-focusable with a descriptive `aria-label`. Rendering is byte-identical to the former
 * `ThinkingHeatmapView`; only the `ItemView` shell was dropped so it mounts inside the surface.
 */
export class ThinkingHeatmapRenderer extends KnowledgeModeRenderer {
    private state: ViewState = "empty";
    private cells: DayCell[] = [];
    private total = 0;

    onload(): void {
        this.recompute();
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
        const root = this.container;
        root.empty();
        const container = root.createDiv({ cls: c("thinking-heatmap") });

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
