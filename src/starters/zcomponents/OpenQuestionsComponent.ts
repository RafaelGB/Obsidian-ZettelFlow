import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { activateSidebarView } from "architecture/plugin";
import { OpenQuestionsView } from "architecture/components/core/openQuestions/OpenQuestionsView";

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
            callback: () => void activateSidebarView(this.plugin.app, OpenQuestionsView.NAME),
        });
    }
}
