import ZettelFlow from "main";
import { canvas } from 'architecture/plugin/canvas';
import { log } from "architecture";
import { SelectorMenuModal } from "zettelkasten";
import { MarkdownView, Notice, TFile, TFolder } from "obsidian";
import { checkSemaphore, FrontmatterService } from "architecture/plugin";
export class VaultHooks {
    // Cache to store the previous value of the monitored property for each file.
    private propertyCache: Record<string, any> = {};
    private globalHook: { property: string, script: string };
    public static setup(plugin: ZettelFlow) {
        new VaultHooks(plugin);
    }
    constructor(private plugin: ZettelFlow) {
        this.plugin.app.workspace.onLayoutReady(() => {
            setTimeout(() => {
                plugin.registerEvent(this.onRename);
                plugin.registerEvent(this.onDelete);
                plugin.registerEvent(this.onCreate);
                plugin.registerEvent(this.onUpdate);
                plugin.registerEvent(this.onOpen);
                log.debug("Vault hooks setup with layout ready");
            }, 4000);
        });

        // For testing purposes, mount a mock globalHook configuration if not already set.

        this.globalHook = {
            property: "dailyLink",
            script: "console.log('Global Hook triggered on file:', file.path); new Notice('Global Hook executed!');"
        };
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
        if (!(file instanceof TFile)) {
            return;
        }
        const fileService = FrontmatterService.instance(file);
        const frontmatter = fileService.getFrontmatter();
        // Update the cache with the current frontmatter values.
        for (const key in frontmatter) {
            const cacheKey = `${file.path}:${key}`;
            this.propertyCache[cacheKey] = frontmatter[key];
        }
    });

    // Event triggered when a file is modified.
    private onUpdate = this.plugin.app.vault.on("modify", (file) => {
        if (!(file instanceof TFile)) {
            return;
        }
        // Process only Markdown files.
        if (file.extension !== "md") return;

        const fileService = FrontmatterService.instance(file);
        // Retrieve the file's frontmatter.
        const frontmatter = fileService.getFrontmatter();

        // Global hook configuration (monitored property and script).
        if (!this.globalHook) return;
        console.log("Checking global hook property in cache", this.propertyCache);
        // Check if the specified property exists in the file's frontmatter.
        if (this.globalHook.property in frontmatter) {
            const currentValue = frontmatter[this.globalHook.property];
            const cacheKey = `${file.path}:${this.globalHook.property}`;

            // If the property value has changed compared to the cached value, execute the hook.
            if (this.propertyCache[cacheKey] !== currentValue) {
                this.executeHook(this.globalHook.script, file);
                // Update the cached value.
                this.propertyCache[cacheKey] = currentValue;
            }
        }
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