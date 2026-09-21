import { WorkspaceLeaf } from "obsidian";
import ZettelFlow from "main";
import { ModeHostView } from "./ModeHostView";
import { KnowledgeModeRenderer } from "./KnowledgeModeRenderer";
import { HomeModeRenderer } from "architecture/components/core/home/HomeModeRenderer";
import { CultivateModeRenderer } from "architecture/components/core/cultivate/CultivateModeRenderer";
import { LabRenderer } from "architecture/components/core/lab/LabRenderer";

/**
 * The **Home** surface (#272) — the front door, with modes: Home (the narrative overview) and Recent
 * (**what ZettelFlow changed**, #454). Constructed with the plugin so the Recent mode can read the
 * write record and take a batch of writes back.
 */
export class HomeSurfaceView extends ModeHostView {
    constructor(leaf: WorkspaceLeaf, private readonly plugin: ZettelFlow) {
        super(leaf);
    }

    getViewType(): string {
        return "zettelflow-home";
    }

    getIcon(): string {
        return "house";
    }

    protected createRenderer(modeId: string, container: HTMLElement, state?: Record<string, unknown>): KnowledgeModeRenderer {
        switch (modeId) {
            case "cultivate":
                return new CultivateModeRenderer(container, this.plugin, state);
            case "lab":
                // The subject travels in the view state (#473), the same seam deep links use —
                // and since #499 the move that opened the space travels beside it.
                return new LabRenderer(
                    container,
                    this.app,
                    typeof state?.about === "string" ? state.about : undefined,
                    typeof state?.frame === "string" ? state.frame : undefined
                );
            case "home":
            default:
                return new HomeModeRenderer(container, this.app);
        }
    }
}
