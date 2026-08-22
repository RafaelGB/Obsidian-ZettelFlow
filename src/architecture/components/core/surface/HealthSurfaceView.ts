import { ModeHostView } from "./ModeHostView";
import { KnowledgeModeRenderer } from "./KnowledgeModeRenderer";
import { SlipboxHealthRenderer } from "architecture/components/core/slipboxHealth/SlipboxHealthRenderer";
import { KnowledgeDashboardRenderer } from "architecture/components/core/knowledgeDashboard/KnowledgeDashboardRenderer";
import { EvolutionTimelineRenderer } from "architecture/components/core/timeline/EvolutionTimelineRenderer";
import { ThinkingHeatmapRenderer } from "architecture/components/core/thinkingHeatmap/ThinkingHeatmapRenderer";

/**
 * The **Health** surface (#272) — one destination for the state of your slip-box, with modes:
 * Health (debt + balance) · Dashboard (ops console) · Timeline (a note's evolution) · Momentum (the
 * development heatmap). Each mode reuses the retired view's renderer verbatim.
 */
export class HealthSurfaceView extends ModeHostView {
    getViewType(): string {
        return "zettelflow-health";
    }

    getIcon(): string {
        return "stethoscope";
    }

    protected createRenderer(modeId: string, container: HTMLElement): KnowledgeModeRenderer {
        switch (modeId) {
            case "dashboard":
                return new KnowledgeDashboardRenderer(container, this.app);
            case "timeline":
                return new EvolutionTimelineRenderer(container, this.app);
            case "momentum":
                return new ThinkingHeatmapRenderer(container);
            case "health":
            default:
                return new SlipboxHealthRenderer(container, this.app);
        }
    }
}
