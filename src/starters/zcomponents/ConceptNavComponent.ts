import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { openSurfaceForCommand } from "architecture/components/core/surface/openSurface";

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
            callback: () => openSurfaceForCommand(this.plugin.app, "show-concept-nav"),
        });
    }
}
