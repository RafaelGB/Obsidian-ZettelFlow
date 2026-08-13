import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { activateSidebarView } from "architecture/plugin";
import { ResurfaceView } from "architecture/components/core/resurface/ResurfaceView";

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
            callback: () => void activateSidebarView(this.plugin.app, ResurfaceView.NAME),
        });
    }
}
