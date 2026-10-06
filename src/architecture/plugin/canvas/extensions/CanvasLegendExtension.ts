import { Canvas } from "obsidian/canvas";
import CanvasExtension from "./CanvasExtension";
import CanvasHelper from "./utils/CanvasHelper";
import { CanvasDock, type DockPanel } from "./utils/CanvasDock";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { PHASE_LABEL_KEY } from "zettelkasten/phases";
import { phaseColourLegend } from "zettelkasten/phases/phaseColor";
import { NODE_BADGE_ICON, NODE_BADGE_LABEL_KEY, type NodeBadgeKind } from "architecture/plugin/workflow";
import { setIcon } from "obsidian";

type LocaleKey = Parameters<typeof t>[0];

/** Reading order of the badge vocabulary in the legend. */
const BADGE_ORDER: NodeBadgeKind[] = ["start", "asks", "template", "satellite", "optional", "gated"];

/**
 * The canvas explains its own language (#429, epic #422).
 *
 * Colour means the phase and badges say what a step does — which is only true if you can find out
 * without leaving the canvas for the docs. A collapsed chip sits out of the way; opening it states
 * every colour, the two phases that share the closing one, and what each badge means.
 *
 * Since #686 it is the first tab of the canvas dock rather than a chip of its own. Purely cosmetic
 * and fully torn down on unload: the dock is one element on `canvas.wrapperEl`, feature-detected,
 * removed again with its last tab (§VI, FR-7, FR-9).
 */
export default class CanvasLegendExtension extends CanvasExtension {
    private panel: DockPanel | undefined;

    init(): void {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("zettelflow-canvas-render", (canvas: Canvas) =>
                this.sync(canvas)
            )
        );
        this.plugin.register(() => this.remove());
    }

    private sync(canvas: Canvas): void {
        if (!CanvasHelper.isCanvasFlow(this.plugin, canvas)) {
            this.remove();
            return;
        }
        if (this.panel?.body.isConnected) return; // already there — idempotent

        const wrapperEl = canvas?.wrapperEl;
        if (!wrapperEl) {
            log.warn("[CanvasLegendExtension] canvas.wrapperEl not available — skipping the legend");
            return;
        }

        this.remove();
        this.panel = CanvasDock.of(wrapperEl).panel("legend", t("canvas_legend_toggle"), 0, { icon: "info" });
        this.renderBody(this.panel.body);
    }

    private renderBody(body: HTMLElement): void {
        body.createDiv({ cls: c("canvas-dock-title"), text: t("canvas_legend_title") });
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
            const chip = badges.createSpan({ cls: [c("node-badge"), c(`node-badge-${kind}`)] });
            setIcon(chip.createSpan({ cls: c("node-badge-icon") }), NODE_BADGE_ICON[kind]);
            // The legend names a badge, not a count: "questions it asks", not "{0} questions".
            chip.createSpan({ text: t(kind === "asks" ? "node_badge_asks_legend" : (NODE_BADGE_LABEL_KEY[kind] as LocaleKey)) });
        }
    }

    private remove(): void {
        this.panel?.remove();
        this.panel = undefined;
    }
}
