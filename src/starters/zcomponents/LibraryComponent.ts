import { Menu, TFile } from "obsidian";
import { PluginComponent } from "architecture";
import { t } from "architecture/lang";
import { sourceFormat } from "application/library/sourceMeta";
import { setLibraryHost } from "architecture/components/core/library/libraryHost";
import { openLibrary } from "architecture/components/core/library/openLibrary";
import { clearCoverCache } from "architecture/components/core/library/libraryCovers";
import ZettelFlow from "main";

/**
 * The doors into the Library (#680, epic #675):
 *
 * - **the ribbon menu's *Library*** — the rank-1 door (L7), through the command below, which the
 *   ribbon menu runs by id;
 * - **Show in the library**, on a PDF's or an EPUB's own menu — the source's detail, on arrival.
 *
 * The component also hands the Library its plugin, so it reads and saves through it (#374), and
 * lets the session's covers go when the plugin unloads.
 */
export class LibraryComponent extends PluginComponent {
    constructor(private plugin: ZettelFlow) {
        super(plugin);
    }

    onLoad(): void {
        setLibraryHost(this.plugin);
        const app = this.plugin.app;

        this.plugin.addCommand({
            id: "open-library",
            name: t("command_open_library"),
            callback: () => void openLibrary(app),
        });

        this.plugin.registerEvent(
            app.workspace.on("file-menu", (menu: Menu, file) => {
                if (!(file instanceof TFile) || !sourceFormat(file.path)) return;
                menu.addItem((item) =>
                    item
                        .setTitle(t("shelf_menu_show"))
                        .setIcon("library")
                        .onClick(() => void openLibrary(app, file.path))
                );
            })
        );
    }

    onUnload(): void {
        setLibraryHost(null);
        clearCoverCache();
    }
}
