import ZettelFlow from "main";
import { canvas } from 'architecture/plugin/canvas';
import { log } from "architecture";
import { SelectorMenuModal } from "zettelkasten";
import { MarkdownView, Notice, TFile, TFolder } from "obsidian";
import { checkSemaphore, FrontmatterService } from "architecture/plugin";
export class VaultHooks {
    // Cache to store the previous value of the monitored property for each file.
    private currentFrontmatter: FrontmatterService | null = null;
    private globalHook: Array<{ property: string, script: string }>;
    public static setup(plugin: ZettelFlow) {
        new VaultHooks(plugin);
    }
    constructor(private plugin: ZettelFlow) {
        this.plugin.app.workspace.onLayoutReady(() => {
            setTimeout(() => {
                plugin.registerEvent(this.onRename);
                plugin.registerEvent(this.onDelete);
                plugin.registerEvent(this.onCreate);
                plugin.registerEvent(this.onCacheUpdate);
                plugin.registerEvent(this.onOpen);
                log.debug("Vault hooks setup with layout ready");
            }, 4000);
        });

        // For testing purposes, mount a mock globalHook configuration if not already set.

        this.globalHook = [{
            property: "dailyLink",
            script: "console.log('Global Hook triggered on file:', file.path); new Notice('Global Hook executed!');"
        }];
    }

    private onRename = this.plugin.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFolder) {
            this.onRenameFolder(file, oldPath);
        } else if (file instanceof TFile) {
            this.onRenameFile(file, oldPath);
        }
    });

    private onRenameFolder(folder: TFolder, oldPath: string) {
        const potentialCanvasConfig = `${this.plugin.settings.foldersFlowsPath}/${oldPath.replace(/\//g, "_")}.canvas`;
        const potentialCanvasFile = this.plugin.app.vault.getAbstractFileByPath(potentialCanvasConfig);
        // If the folder has an associated canvas file, we need to update the canvas file path
        if (potentialCanvasFile) {
            this.plugin.app.vault.rename(potentialCanvasFile, `${this.plugin.settings.foldersFlowsPath}/${folder.path.replace(/\//g, "_")}.canvas`);
        }
    }

    private onRenameFile(file: TFile, oldPath: string) {
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
    }

    private onDelete = this.plugin.app.vault.on("delete", (file) => {
        if (file instanceof TFolder) {
            this.onDeleteFolder(file);
        } else if (file instanceof TFile) {
            this.onDeleteFile(file);
        }

    });

    private onDeleteFolder = (folder: TFolder) => {
        const potentialCanvasConfig = `${this.plugin.settings.foldersFlowsPath}/${folder.path.replace(/\//g, "_")}.canvas`;
        const potentialCanvasFile = this.plugin.app.vault.getAbstractFileByPath(potentialCanvasConfig);
        if (potentialCanvasFile) {
            canvas.flows.delete(potentialCanvasFile.path);
            this.plugin.app.vault.delete(potentialCanvasFile);
            log.info(`Deleted canvas file for folder ${folder.path}: ${potentialCanvasFile.path}`);
        }
    }

    private onDeleteFile = (file: TFile) => {
        if (file.path === this.plugin.settings.ribbonCanvas) {
            canvas.flows.delete(file.path);
            this.plugin.settings.ribbonCanvas = "";
            this.plugin.saveSettings();
            log.info("Deleted canvas file");
        } else if (file.path === this.plugin.settings.jsLibraryFolderPath) {
            this.plugin.settings.jsLibraryFolderPath = "";
            log.info("Deleted canvas file");
        }
    }


    private onCreate = this.plugin.app.vault.on("create", async (file) => {
        const parent = file.parent;
        if (!parent || !checkSemaphore()) {
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
            }, 300);
        }

    });
    private onOpen = this.plugin.app.workspace.on("file-open", (file) => {
        if (file instanceof TFile && file.extension === "md") {
            this.currentFrontmatter = FrontmatterService.instance(file);
            log.info("Nuevo fichero abierto:", file.path);
        } else {
            this.currentFrontmatter = null;
        }
    });

    // Event triggered when a file is modified.
    private onCacheUpdate = this.plugin.app.metadataCache.on("changed", (file, _data, cache) => {
        if (!this.currentFrontmatter) {
            this.currentFrontmatter = FrontmatterService.instance(file);
            return;
        }
        // Verifica que exista configuración de hooks y que tengamos un fichero abierto.
        if (!this.globalHook?.length || !this.currentFrontmatter) return;
        // Solo procesamos ficheros Markdown.
        if (file.extension !== "md") return;


        // Obtenemos el frontmatter antiguo (del servicio) y el nuevo (de la cache).
        const oldFrontmatter = this.currentFrontmatter.getFrontmatter();
        const newFrontmatter: Record<string, any> = cache.frontmatter || {};

        // Recorremos cada hook configurado y comprobamos cambios en la propiedad.
        this.globalHook.forEach(({ property, script }) => {
            const oldValue = oldFrontmatter[property];
            const newValue = newFrontmatter[property];

            // Si la propiedad ha sido eliminada, añadida o modificada...
            if (oldValue !== newValue) {
                log.info(`Propiedad "${property}" modificada en ${file.path}:`, { oldValue, newValue });
                this.executeHook(script, file);
            }
        });

        // Actualizamos el servicio para reflejar el nuevo estado del frontmatter.
        this.currentFrontmatter = FrontmatterService.instance(file);
    });

    // Execute the script defined in the global hook configuration.
    private executeHook(script: string, file: TFile) {
        try {
            // Execute the script in the context of the file.
            const func = new Function("file", script);
            func(file);
        } catch (error) {
            new Notice("Error executing global hook: " + error.message);
        }
    }
}