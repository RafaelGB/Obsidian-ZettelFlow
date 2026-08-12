import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { activateSidebarView } from "architecture/plugin";
import { DiscoveriesView } from "architecture/components/core/discoveries/DiscoveriesView";

/** Registers the `show-discoveries` command (#163), opening the morning-discovery pane. No hotkey. */
export class DiscoveriesComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "show-discoveries",
            name: t("command_show_discoveries"),
            callback: () => void activateSidebarView(this.plugin.app, DiscoveriesView.NAME),
        });
    }
}
