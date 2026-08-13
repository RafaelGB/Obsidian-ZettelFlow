import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { activateSidebarView } from "architecture/plugin";
import { EvolutionTimelineView } from "architecture/components/core/timeline/EvolutionTimelineView";

/** Registers the `show-evolution-timeline` command (#168), opening the evolution-timeline view. No hotkey. */
export class EvolutionTimelineComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "show-evolution-timeline",
            name: t("command_show_evolution_timeline"),
            callback: () => void activateSidebarView(this.plugin.app, EvolutionTimelineView.NAME),
        });
    }
}
