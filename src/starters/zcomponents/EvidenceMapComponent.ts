import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { activateSidebarView } from "architecture/plugin";
import { EvidenceMapView } from "architecture/components/core/evidenceMap/EvidenceMapView";

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
            callback: () => void activateSidebarView(this.plugin.app, EvidenceMapView.NAME),
        });
    }
}
