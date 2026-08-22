import { ModeHostView } from "./ModeHostView";
import { KnowledgeModeRenderer } from "./KnowledgeModeRenderer";
import { DiscoveriesRenderer } from "architecture/components/core/discoveries/DiscoveriesRenderer";
import { ResurfaceRenderer } from "architecture/components/core/resurface/ResurfaceRenderer";
import { OpenQuestionsRenderer } from "architecture/components/core/openQuestions/OpenQuestionsRenderer";
import { EvidenceMapRenderer } from "architecture/components/core/evidenceMap/EvidenceMapRenderer";

/**
 * The **Discovery** surface (#272) — one destination for finding what to explore next, with modes:
 * Connections (surprising pairs) · Forgotten (resurfaced notes) · Questions (open questions) ·
 * Challenges (evidence map). Each mode reuses the retired view's renderer verbatim.
 */
export class DiscoverySurfaceView extends ModeHostView {
    getViewType(): string {
        return "zettelflow-discovery";
    }

    getIcon(): string {
        return "telescope";
    }

    protected createRenderer(modeId: string, container: HTMLElement): KnowledgeModeRenderer {
        switch (modeId) {
            case "forgotten":
                return new ResurfaceRenderer(container, this.app);
            case "questions":
                return new OpenQuestionsRenderer(container, this.app);
            case "challenges":
                return new EvidenceMapRenderer(container, this.app);
            case "connections":
            default:
                return new DiscoveriesRenderer(container, this.app);
        }
    }
}
