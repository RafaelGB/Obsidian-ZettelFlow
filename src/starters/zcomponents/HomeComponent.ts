import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { activateSurface } from "architecture/plugin";
import { openSurfaceForCommand } from "architecture/components/core/surface/openSurface";

/** Registers the `show-home` command (#172), opening the ZettelFlow Home surface. No hotkey. */
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
            callback: () => openSurfaceForCommand(this.plugin.app, "show-home"),
        });
        // "Open ZettelFlow, not Obsidian" (#246 A2): greet the user with Home on launch when enabled,
        // unless a Home leaf is already restored open. Opt-in; first-run turns it on for new users.
        this.plugin.app.workspace.onLayoutReady(() => {
            if (!this.plugin.settings.openHomeOnStartup) return;
            if (this.plugin.app.workspace.getLeavesOfType("zettelflow-home").length > 0) return;
            void activateSurface(this.plugin.app, "zettelflow-home", "home");
        });
    }
}
