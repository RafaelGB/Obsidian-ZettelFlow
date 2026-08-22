import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { openSurfaceForCommand } from "architecture/components/core/surface/openSurface";

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
            callback: () => openSurfaceForCommand(this.plugin.app, "show-slipbox-health"),
        });
    }
}
