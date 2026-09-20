import { ModeHostView } from "./ModeHostView";
import { KnowledgeModeRenderer } from "./KnowledgeModeRenderer";
import { AskGraphRenderer } from "architecture/components/core/askGraph/AskGraphRenderer";

/**
 * The **Explore** surface (#487, epic #481) — where a selection is made and read.
 *
 * It was the fifth mode of Discovery until someone opened it. Discovery's four modes are narrow
 * lists, so that is where people keep it: a side panel. Explore is facets, chips, an answer, a
 * lens bar and a 3D graph, and a *mode* cannot be moved out of a pane without dragging the four
 * lists along with it. A workspace needs a leaf of its own.
 *
 * One mode, and therefore no mode bar. The switching that matters here is the lens.
 */
export class ExploreSurfaceView extends ModeHostView {
    getViewType(): string {
        return "zettelflow-explore";
    }

    getIcon(): string {
        return "telescope";
    }

    protected createRenderer(
        _modeId: string,
        container: HTMLElement,
        state?: Record<string, unknown>
    ): KnowledgeModeRenderer {
        return new AskGraphRenderer(
            container,
            this.app,
            typeof state?.query === "string" ? state.query : undefined,
            typeof state?.lens === "string" ? state.lens : undefined
        );
    }
}
