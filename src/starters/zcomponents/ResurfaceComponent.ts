import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { openSurfaceForCommand } from "architecture/components/core/surface/openSurface";

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
            callback: () => openSurfaceForCommand(this.plugin.app, "resurface-related-notes"),
        });
    }
}
