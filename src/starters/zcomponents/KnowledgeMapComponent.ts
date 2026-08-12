import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { activateSidebarView } from "architecture/plugin";
import { KnowledgeMapView } from "architecture/components/core/knowledgeMap/KnowledgeMapView";

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
            callback: () => void activateSidebarView(this.plugin.app, KnowledgeMapView.NAME),
        });
    }
}
