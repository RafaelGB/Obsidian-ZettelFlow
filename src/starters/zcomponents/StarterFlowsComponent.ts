import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { StarterFlowsModal } from "zettelkasten/modals/StarterFlowsModal";

export class StarterFlowsComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "install-starter-flows",
            name: t("command_install_starter_flows"),
            callback: () => new StarterFlowsModal(this.plugin.app).open(),
        });
    }
}
