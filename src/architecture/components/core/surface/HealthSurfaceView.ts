import { ModeHostView } from "./ModeHostView";
import { KnowledgeModeRenderer } from "./KnowledgeModeRenderer";
import { SlipboxHealthRenderer } from "architecture/components/core/slipboxHealth/SlipboxHealthRenderer";
import { ThinkingHeatmapRenderer } from "architecture/components/core/thinkingHeatmap/ThinkingHeatmapRenderer";
import { AgencyReviewRenderer } from "architecture/components/core/agencyReview/AgencyReviewRenderer";

/**
 * The **Health** surface (#272) — one destination for the state of your slip-box, with modes:
 * Health (connectivity · today · debt · balance · orphans/dead-ends — the ops console merged in,
 * #314) · Momentum (the development heatmap) · Agency. A note's own history left for the right
 * sidebar as This note (#640).
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
            case "momentum":
                return new ThinkingHeatmapRenderer(container);
            case "agency":
                return new AgencyReviewRenderer(container, this.app);
            case "health":
            default:
                return new SlipboxHealthRenderer(container, this.app);
        }
    }
}
