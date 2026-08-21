import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { openSurfaceForCommand } from "architecture/components/core/surface/openSurface";

/** Registers the `show-evidence-map` command (#169), opening the evidence-map view. No hotkey. */
export class EvidenceMapComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "show-evidence-map",
            name: t("command_show_evidence_map"),
            callback: () => openSurfaceForCommand(this.plugin.app, "show-evidence-map"),
        });
    }
}
