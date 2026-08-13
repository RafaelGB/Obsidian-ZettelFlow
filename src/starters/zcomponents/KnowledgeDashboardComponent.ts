import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { activateSidebarView } from "architecture/plugin";
import { KnowledgeDashboardView } from "architecture/components/core/knowledgeDashboard/KnowledgeDashboardView";

/** Registers the `show-knowledge-dashboard` command (#171), opening the ops-console dashboard. No hotkey. */
export class KnowledgeDashboardComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "show-knowledge-dashboard",
            name: t("command_show_knowledge_dashboard"),
            callback: () => void activateSidebarView(this.plugin.app, KnowledgeDashboardView.NAME),
        });
    }
}
