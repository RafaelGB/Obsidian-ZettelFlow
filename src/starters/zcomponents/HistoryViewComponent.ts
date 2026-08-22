import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { openSurfaceForCommand } from "architecture/components/core/surface/openSurface";

/** Registers the `show-notes-history` command (#272): opens the Home surface at its Recent mode. */
export class HistoryViewComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "show-notes-history",
            name: t("command_show_history"),
            callback: () => openSurfaceForCommand(this.plugin.app, "show-notes-history"),
        });
    }
}
