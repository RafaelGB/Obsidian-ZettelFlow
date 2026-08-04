import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { HistoryView } from "architecture/components/core/historyView/HistoryView";

export class HistoryViewComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "show-notes-history",
            name: t("command_show_history"),
            callback: () => void this.activateView(),
        });
    }

    private async activateView(): Promise<void> {
        const { workspace } = this.plugin.app;
        const existing = workspace.getLeavesOfType(HistoryView.NAME);
        if (existing.length > 0) {
            void workspace.revealLeaf(existing[0]);
            return;
        }
        const leaf = workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({ type: HistoryView.NAME, active: true });
            void workspace.revealLeaf(leaf);
        }
    }
}
