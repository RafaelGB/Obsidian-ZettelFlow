import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { openSurfaceForCommand } from "architecture/components/core/surface/openSurface";

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
            callback: () => openSurfaceForCommand(this.plugin.app, "show-knowledge-dashboard"),
        });
    }
}
