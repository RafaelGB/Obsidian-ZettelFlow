import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { activateSidebarView } from "architecture/plugin";
import { SlipboxHealthView } from "architecture/components/core/slipboxHealth/SlipboxHealthView";

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
            callback: () => void activateSidebarView(this.plugin.app, SlipboxHealthView.NAME),
        });
    }
}
