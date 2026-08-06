import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { MocBuilderModal } from "zettelkasten/modals/MocBuilderModal";

export class MocBuilderComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "build-map-of-content",
            name: t("command_build_moc"),
            callback: () => new MocBuilderModal(this.plugin.app).open(),
        });
    }
}
