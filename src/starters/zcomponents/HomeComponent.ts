import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { activateSidebarView } from "architecture/plugin";
import { ZettelFlowHomeView } from "architecture/components/core/home/ZettelFlowHomeView";

/** Registers the `show-home` command (#172), opening the ZettelFlow Home leaf. No hotkey. */
export class HomeComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "show-home",
            name: t("command_show_home"),
            callback: () => void activateSidebarView(this.plugin.app, ZettelFlowHomeView.NAME),
        });
    }
}
