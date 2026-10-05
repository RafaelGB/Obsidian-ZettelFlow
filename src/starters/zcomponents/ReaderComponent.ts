import { Menu, TFile, TFolder } from "obsidian";
import { PluginComponent } from "architecture";
import { t } from "architecture/lang";
import { setReaderHost } from "architecture/components/core/reader/readerHost";
import { readFrom, readSelection } from "architecture/components/core/reader/readingChooser";
import { notesUnder } from "architecture/components/core/reader/readerPaths";
import ZettelFlow from "main";

/**
 * The doors into the Reader (#668, #669, epic #667). No MOC, no setup:
 *
 * - **Read from here**, on any note's menu — the ways through that note, or straight in when there
 *   is only one;
 * - **Read these**, on a multi-selection in the file explorer — the picked notes, in the order
 *   their links suggest;
 * - **Read this folder**, on a folder's menu — every note under it, the same way.
 *
 * The command is the first door for a hotkey. The component also hands the Reader its plugin, so
 * every door can offer to resume a reading left part-way.
 */
export class ReaderComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        setReaderHost(this.plugin);
        const app = this.plugin.app;

        this.plugin.addCommand({
            id: "open-reader",
            name: t("command_open_reader"),
            checkCallback: (checking: boolean) => {
                const file = app.workspace.getActiveFile();
                if (!file || file.extension !== "md") return false;
                if (!checking) readFrom(app, file.path);
                return true;
            },
        });

        this.plugin.registerEvent(
            app.workspace.on("file-menu", (menu: Menu, file) => {
                if (file instanceof TFile && file.extension === "md") {
                    menu.addItem((item) =>
                        item
                            .setTitle(t("reader_read_from_here"))
                            .setIcon("book-open")
                            .onClick(() => readFrom(app, file.path))
                    );
                } else if (file instanceof TFolder) {
                    const notes = notesUnder(file);
                    if (notes.length === 0) return;
                    menu.addItem((item) =>
                        item
                            .setTitle(t("reader_read_folder"))
                            .setIcon("book-open")
                            .onClick(() => readSelection(app, notes))
                    );
                }
            })
        );

        this.plugin.registerEvent(
            app.workspace.on("files-menu", (menu: Menu, files) => {
                const notes = files.filter((f): f is TFile => f instanceof TFile && f.extension === "md").map((f) => f.path);
                if (notes.length < 2) return;
                menu.addItem((item) =>
                    item
                        .setTitle(t("reader_read_these"))
                        .setIcon("book-open")
                        .onClick(() => readSelection(app, notes))
                );
            })
        );
    }

    onUnload(): void {
        setReaderHost(null);
    }
}
