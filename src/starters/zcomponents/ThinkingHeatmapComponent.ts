import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { activateSidebarView } from "architecture/plugin";
import { ThinkingHeatmapView } from "architecture/components/core/thinkingHeatmap/ThinkingHeatmapView";

/** Registers the `show-thinking-heatmap` command (#162), opening the heatmap sidebar view. No hotkey. */
export class ThinkingHeatmapComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "show-thinking-heatmap",
            name: t("command_show_thinking_heatmap"),
            callback: () => void activateSidebarView(this.plugin.app, ThinkingHeatmapView.NAME),
        });
    }
}
