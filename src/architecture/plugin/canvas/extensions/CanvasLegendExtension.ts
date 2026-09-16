import { Canvas } from "obsidian/canvas";
import CanvasExtension from "./CanvasExtension";
import CanvasHelper from "./utils/CanvasHelper";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { PHASE_LABEL_KEY } from "zettelkasten/phases";
import { phaseColourLegend } from "zettelkasten/phases/phaseColor";
import { NODE_BADGE_LABEL_KEY, type NodeBadgeKind } from "architecture/plugin/workflow";

type LocaleKey = Parameters<typeof t>[0];

/** Reading order of the badge vocabulary in the legend. */
const BADGE_ORDER: NodeBadgeKind[] = ["asks", "template", "satellite", "optional", "gated"];

/**
 * The canvas explains its own language (#429, epic #422).
 *
 * Colour means the phase and badges say what a step does — which is only true if you can find out
 * without leaving the canvas for the docs. A collapsed chip sits out of the way; opening it states
 * every colour, the two phases that share the closing one, and what each badge means.
 *
 * Purely cosmetic and fully torn down on unload: it adds one element to `canvas.wrapperEl` (the
 * same door `EmptyStateExtension` uses), feature-detected, and removes it again (§VI, FR-7, FR-9).
 */
export default class CanvasLegendExtension extends CanvasExtension {
    private legendEl: HTMLElement | undefined;

    init(): void {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("zettelflow-canvas-render", (canvas: Canvas) =>
                this.sync(canvas)
            )
        );
        this.plugin.register(() => this.remove());
    }

    private sync(canvas: Canvas): void {
        if (!CanvasHelper.isCanvasFlow(this.plugin)) {
            this.remove();
            return;
        }
        if (this.legendEl?.isConnected) return; // already there — idempotent

        const wrapperEl = canvas?.wrapperEl;
        if (!wrapperEl) {
            log.warn("[CanvasLegendExtension] canvas.wrapperEl not available — skipping the legend");
            return;
        }

        this.remove();
        this.legendEl = wrapperEl.createDiv({ cls: c("canvas-legend") });
        const toggle = this.legendEl.createEl("button", {
            cls: c("canvas-legend-toggle"),
            text: t("canvas_legend_toggle"),
            attr: { type: "button", "aria-expanded": "false" },
        });
        const body = this.legendEl.createDiv({ cls: c("canvas-legend-body") });
        body.addClass(c("is-hidden"));
        toggle.addEventListener("click", () => {
            const open = toggle.getAttribute("aria-expanded") !== "true";
            toggle.setAttribute("aria-expanded", String(open));
            body.toggleClass(c("is-hidden"), !open);
        });

        this.renderBody(body);
    }

    private renderBody(body: HTMLElement): void {
        body.createEl("h6", { text: t("canvas_legend_title") });
        body.createDiv({ cls: c("canvas-legend-note"), text: t("canvas_legend_colours") });

        const colours = body.createDiv({ cls: c("canvas-legend-colours") });
        for (const entry of phaseColourLegend()) {
            const row = colours.createDiv({ cls: c("canvas-legend-row") });
            const swatch = row.createSpan({ cls: c("canvas-legend-swatch") });
            swatch.addClass(c(`canvas-legend-swatch-${entry.color}`));
            row.createSpan({
                cls: c("canvas-legend-label"),
                text: entry.phases.map((phase) => t(PHASE_LABEL_KEY[phase])).join(" · "),
            });
        }
        body.createDiv({ cls: c("canvas-legend-note"), text: t("canvas_legend_shared") });

        body.createDiv({ cls: c("canvas-legend-note"), text: t("canvas_legend_badges") });
        const badges = body.createDiv({ cls: c("canvas-legend-badges") });
        for (const kind of BADGE_ORDER) {
            badges.createSpan({
                cls: c("node-badge"),
                text: t(NODE_BADGE_LABEL_KEY[kind] as LocaleKey),
            });
        }
    }

    private remove(): void {
        this.legendEl?.remove();
        this.legendEl = undefined;
    }
}
