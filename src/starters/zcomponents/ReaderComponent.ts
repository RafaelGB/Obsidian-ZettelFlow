import { Menu, TFile } from "obsidian";
import { PluginComponent } from "architecture";
import { t } from "architecture/lang";
import { openReader } from "architecture/components/core/reader/openReader";
import ZettelFlow from "main";

/**
 * The door into the Reader (#668, epic #667): **Read from here**, on any note's context menu.
 *
 * No MOC, no setup: the note you right-click is where the reading starts, and the path is built
 * from what ZettelFlow already knows about it. The command is the same door for a hotkey.
 */
export class ReaderComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "open-reader",
            name: t("command_open_reader"),
            checkCallback: (checking: boolean) => {
                const file = this.plugin.app.workspace.getActiveFile();
                if (!file || file.extension !== "md") return false;
                if (!checking) void openReader(this.plugin.app, file.path);
                return true;
            },
        });

        this.plugin.registerEvent(
            this.plugin.app.workspace.on("file-menu", (menu: Menu, file) => {
                if (!(file instanceof TFile) || file.extension !== "md") return;
                menu.addItem((item) =>
                    item
                        .setTitle(t("reader_read_from_here"))
                        .setIcon("book-open")
                        .onClick(() => void openReader(this.plugin.app, file.path))
                );
            })
        );
    }
}
