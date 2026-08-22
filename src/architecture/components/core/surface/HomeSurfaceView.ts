import { WorkspaceLeaf } from "obsidian";
import ZettelFlow from "main";
import { ModeHostView } from "./ModeHostView";
import { KnowledgeModeRenderer } from "./KnowledgeModeRenderer";
import { HomeModeRenderer } from "architecture/components/core/home/HomeModeRenderer";
import { HistoryRenderer } from "architecture/components/core/historyView/HistoryRenderer";

/**
 * The **Home** surface (#272) — the front door, with modes: Home (the narrative overview) and Recent
 * (recently built notes, folded in from the old history view). Constructed with the plugin so the
 * Recent mode can read/clear `plugin.settings.history`.
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

    protected createRenderer(modeId: string, container: HTMLElement): KnowledgeModeRenderer {
        switch (modeId) {
            case "recent":
                return new HistoryRenderer(container, this.plugin);
            case "home":
            default:
                return new HomeModeRenderer(container, this.app);
        }
    }
}
