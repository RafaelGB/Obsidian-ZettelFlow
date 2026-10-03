import { ModeHostView } from "./ModeHostView";
import { KnowledgeModeRenderer } from "./KnowledgeModeRenderer";
import { TendRenderer } from "architecture/components/core/tend/TendRenderer";
import { ThinkingHeatmapRenderer } from "architecture/components/core/thinkingHeatmap/ThinkingHeatmapRenderer";
import { AgencyReviewRenderer } from "architecture/components/core/agencyReview/AgencyReviewRenderer";

/**
 * The **Health** surface (#272) — one destination for the state of your slip-box, with modes:
 * Tend (which notes need you, each handed to This note on its fix — #644, replacing the ops
 * console of #314) · Momentum (the development heatmap) · Agency. A note's own history left for
 * the right sidebar as This note (#640).
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
            case "tend":
            default:
                return new TendRenderer(container, this.app);
        }
    }
}
