import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { ResurfaceView } from "architecture/components/core/resurface/ResurfaceView";

export class ResurfaceComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "resurface-related-notes",
            name: t("command_resurface"),
            callback: () => void this.activateView(),
        });
    }

    private async activateView(): Promise<void> {
        const { workspace } = this.plugin.app;
        const existing = workspace.getLeavesOfType(ResurfaceView.NAME);
        if (existing.length > 0) {
            void workspace.revealLeaf(existing[0]);
            return;
        }
        const leaf = workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({ type: ResurfaceView.NAME, active: true });
            void workspace.revealLeaf(leaf);
        }
    }
}
