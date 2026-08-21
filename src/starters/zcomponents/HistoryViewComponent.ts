import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { HistoryView } from "architecture/components/core/historyView/HistoryView";
import { activateSidebarView } from "architecture/plugin";

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
        await activateSidebarView(this.plugin.app, HistoryView.NAME);
    }
}
