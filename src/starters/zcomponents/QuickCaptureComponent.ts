import { PluginComponent } from "architecture";
import { t } from "architecture/lang";
import ZettelFlow from "main";
import { QuickCaptureModal } from "zettelkasten/modals/QuickCaptureModal";

/** Registers the lowest-friction capture command (#285 S3). No default hotkey — the user binds one. */
export class QuickCaptureComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "quick-capture",
            name: t("command_quick_capture"),
            callback: () => new QuickCaptureModal(this.plugin).open(),
        });
    }
}
