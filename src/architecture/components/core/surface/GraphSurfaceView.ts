import { ModeHostView } from "./ModeHostView";
import { KnowledgeModeRenderer } from "./KnowledgeModeRenderer";
import { Graph3DRenderer } from "architecture/components/core/graph3d/Graph3DRenderer";

/**
 * The **Graph** surface (#272, #280) — an immersive **3D knowledge graph** of your slip-box. The
 * retired 2D Map/Navigate modes were folded away; the surface is 3D-only, and the old `show-knowledge-map`
 * / `show-concept-nav` aliases open this 3D mode (see legacyTargets).
 */
export class GraphSurfaceView extends ModeHostView {
    getViewType(): string {
        return "zettelflow-graph";
    }

    getIcon(): string {
        return "network";
    }

    protected createRenderer(_modeId: string, container: HTMLElement): KnowledgeModeRenderer {
        return new Graph3DRenderer(container, this.app);
    }
}
