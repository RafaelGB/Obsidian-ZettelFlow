import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { SlipboxHealthView } from "architecture/components/core/slipboxHealth/SlipboxHealthView";

export class SlipboxHealthViewComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "show-slipbox-health",
            name: t("command_show_slipbox_health"),
            callback: () => void this.activateView(),
        });
    }

    private async activateView(): Promise<void> {
        const { workspace } = this.plugin.app;
        const existing = workspace.getLeavesOfType(SlipboxHealthView.NAME);
        if (existing.length > 0) {
            void workspace.revealLeaf(existing[0]);
            return;
        }
        const leaf = workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({ type: SlipboxHealthView.NAME, active: true });
            void workspace.revealLeaf(leaf);
        }
    }
}
