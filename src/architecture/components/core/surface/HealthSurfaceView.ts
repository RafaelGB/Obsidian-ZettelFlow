import { ModeHostView } from "./ModeHostView";
import { KnowledgeModeRenderer } from "./KnowledgeModeRenderer";
import { SlipboxHealthRenderer } from "architecture/components/core/slipboxHealth/SlipboxHealthRenderer";
import { EvolutionTimelineRenderer } from "architecture/components/core/timeline/EvolutionTimelineRenderer";
import { ThinkingHeatmapRenderer } from "architecture/components/core/thinkingHeatmap/ThinkingHeatmapRenderer";

/**
 * The **Health** surface (#272) — one destination for the state of your slip-box, with modes:
 * Health (connectivity · today · debt · balance · orphans/dead-ends — the ops console merged in,
 * #314) · Timeline (a note's evolution) · Momentum (the development heatmap).
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
