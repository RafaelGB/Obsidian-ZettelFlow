import { ModeHostView } from "./ModeHostView";
import { surfaceByType, Surface } from "./surfaceRegistry";
import { KnowledgeModeRenderer } from "./KnowledgeModeRenderer";
import { KnowledgeMapRenderer } from "architecture/components/core/knowledgeMap/KnowledgeMapRenderer";
import { ConceptNavRenderer } from "architecture/components/core/conceptNav/ConceptNavRenderer";

/**
 * The **Graph** surface (#272) — one destination for exploring the shape of your knowledge, with
 * modes: Map (hubs + clusters) · Navigate (walk typed neighbours). Reasoning is a deferred mode.
 * Each mode reuses the retired view's renderer verbatim.
 */
export class GraphSurfaceView extends ModeHostView {
    protected readonly surface: Surface = surfaceByType("zettelflow-graph");

    getIcon(): string {
        return "network";
    }

    protected createRenderer(modeId: string, container: HTMLElement): KnowledgeModeRenderer {
        switch (modeId) {
            case "navigate":
                return new ConceptNavRenderer(container, this.app);
            case "map":
            default:
                return new KnowledgeMapRenderer(container, this.app);
        }
    }
}
