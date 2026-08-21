import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { openSurfaceForCommand } from "architecture/components/core/surface/openSurface";

/** Registers the `show-knowledge-map` command (#164), opening the living knowledge-map view. No hotkey. */
export class KnowledgeMapComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "show-knowledge-map",
            name: t("command_show_knowledge_map"),
            callback: () => openSurfaceForCommand(this.plugin.app, "show-knowledge-map"),
        });
    }
}
