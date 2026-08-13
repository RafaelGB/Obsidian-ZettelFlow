import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { activateSidebarView } from "architecture/plugin";
import { ConceptNavView } from "architecture/components/core/conceptNav/ConceptNavView";

/** Registers the `show-concept-nav` command (#166), opening the concept-navigation view. No hotkey. */
export class ConceptNavComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "show-concept-nav",
            name: t("command_show_concept_nav"),
            callback: () => void activateSidebarView(this.plugin.app, ConceptNavView.NAME),
        });
    }
}
