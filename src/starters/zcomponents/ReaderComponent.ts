import { Menu, TFile, TFolder } from "obsidian";
import { PluginComponent } from "architecture";
import { t } from "architecture/lang";
import { setReaderHost } from "architecture/components/core/reader/readerHost";
import { readFrom, readSelection } from "architecture/components/core/reader/readingChooser";
import { notesUnder } from "architecture/components/core/reader/readerPaths";
import { ReaderView } from "architecture/components/core/reader/ReaderView";
import ZettelFlow from "main";
import { KnowledgeIndex } from "architecture/knowledge";

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
                // A note in an excluded folder is outside ZettelFlow (#688): no reading starts there.
                if (!file || file.extension !== "md" || !inScope(file.path)) return false;
                if (!checking) readFrom(app, file.path);
                return true;
            },
        });

        // While a reading is the active tab (#667): turn its pages and leave it from the palette, or
        // from hotkeys you bind — the reader's own ← → and Esc need none. No default hotkeys.
        const reader = (): ReaderView | null => app.workspace.getActiveViewOfType(ReaderView);
        this.plugin.addCommand({
            id: "reader-next-chapter",
            name: t("command_reader_next"),
            checkCallback: (checking: boolean) => {
                const view = reader();
                if (!view) return false;
                if (!checking) view.nextChapter();
                return true;
            },
        });
        this.plugin.addCommand({
            id: "reader-previous-chapter",
            name: t("command_reader_previous"),
            checkCallback: (checking: boolean) => {
                const view = reader();
                if (!view) return false;
                if (!checking) view.previousChapter();
                return true;
            },
        });
        this.plugin.addCommand({
            id: "reader-exit",
            name: t("command_reader_exit"),
            checkCallback: (checking: boolean) => {
                const view = reader();
                if (!view) return false;
                if (!checking) view.exit();
                return true;
            },
        });

        this.plugin.registerEvent(
            app.workspace.on("file-menu", (menu: Menu, file) => {
                if (file instanceof TFile && file.extension === "md") {
                    if (!inScope(file.path)) return;
                    menu.addItem((item) =>
                        item
                            .setTitle(t("reader_read_from_here"))
                            .setIcon("book-open")
                            .onClick(() => readFrom(app, file.path))
                    );
                } else if (file instanceof TFolder && inScope(file.path)) {
                    // The folder is walked when chosen, not on every right-click; an empty one reads nothing.
                    menu.addItem((item) =>
                        item
                            .setTitle(t("reader_read_folder"))
                            .setIcon("book-open")
                            .onClick(() => readSelection(app, notesUnder(file)))
                    );
                }
            })
        );

        this.plugin.registerEvent(
            app.workspace.on("files-menu", (menu: Menu, files) => {
                const notes = files
                    .filter((f): f is TFile => f instanceof TFile && f.extension === "md" && inScope(f.path))
                    .map((f) => f.path);
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

/** Whether a note or folder is inside ZettelFlow — the index's one predicate (#311, #688). */
function inScope(path: string): boolean {
    return KnowledgeIndex.getInstance().inScope(path);
}
