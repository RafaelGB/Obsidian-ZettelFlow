import ZettelFlow from "main";
import { canvas } from 'architecture/plugin/canvas';
import { log } from "architecture";
import { SelectorMenuModal } from "zettelkasten";
import { MarkdownView } from "obsidian";
export class VaultHooks {
    public static setup(plugin: ZettelFlow) {
        new VaultHooks(plugin);
    }
    constructor(private plugin: ZettelFlow) {
        plugin.registerEvent(this.onRename);
        plugin.registerEvent(this.onDelete);
        plugin.registerEvent(this.onCreate);
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

    private onCreate = this.plugin.app.vault.on("create", async (file) => {
        const parent = file.parent;
        console.log(file);
        if (!parent) {
            return;
        }
        const potentialCanvasConfig = `${this.plugin.settings.foldersFlowsPath}/${parent.path.replace(/\//g, "_")}.canvas`;
        const potentialCanvasFile = this.plugin.app.vault.getAbstractFileByPath(potentialCanvasConfig);
        if (potentialCanvasFile) {
            setTimeout(async () => {
                const flow = await canvas.flows.update(potentialCanvasFile.path);
                const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
                if (!activeView) {
                    return;
                }
                new SelectorMenuModal(this.plugin.app, this.plugin, flow, activeView)
                    .enableEditor(true)
                    .open();
            }, 400);
        }

    });
}