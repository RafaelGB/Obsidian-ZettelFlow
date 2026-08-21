import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { openSurfaceForCommand } from "architecture/components/core/surface/openSurface";

/** Registers the `show-open-questions` command (#167), opening the open-questions view. No hotkey. */
export class OpenQuestionsComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "show-open-questions",
            name: t("command_show_open_questions"),
            callback: () => openSurfaceForCommand(this.plugin.app, "show-open-questions"),
        });
    }
}
