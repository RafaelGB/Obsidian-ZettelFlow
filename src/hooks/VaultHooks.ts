import ZettelFlow from "main";
import { canvas } from 'architecture/plugin/canvas';
import { log } from "architecture";
export class VaultHooks {
    public static setup(plugin: ZettelFlow) {
        new VaultHooks(plugin);
    }
    constructor(private plugin: ZettelFlow) {
        plugin.registerEvent(this.onRename);
        plugin.registerEvent(this.onDelete);
    }

    private onRename = this.plugin.app.vault.on("rename", (file, oldPath) => {
        if (oldPath === this.plugin.settings.ribbonCanvas) {
            canvas.flows.delete(oldPath);
            this.plugin.settings.ribbonCanvas = file.path;
            this.plugin.saveSettings();
            log.info("Renamed canvas file");
        } else if (oldPath === this.plugin.settings.jsLibraryFolderPath) {
            this.plugin.settings.jsLibraryFolderPath = file.path;
            this.plugin.saveSettings();
            log.info("Renamed js library folder");
        }
    });

    private onDelete = this.plugin.app.vault.on("delete", (file) => {
        if (file.path === this.plugin.settings.ribbonCanvas) {
            canvas.flows.delete(file.path);
            this.plugin.settings.ribbonCanvas = "";
            this.plugin.saveSettings();
            log.info("Deleted canvas file");
        } else if (file.path === this.plugin.settings.jsLibraryFolderPath) {
            this.plugin.settings.jsLibraryFolderPath = "";
            log.info("Deleted canvas file");
        }
    });
}