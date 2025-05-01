import ZettelFlow from "main";
import { canvas } from 'architecture/plugin/canvas';
import { log } from "architecture";
import { SelectorMenuModal } from "zettelkasten";
import { CachedMetadata, MarkdownView, Notice, TAbstractFile, TFile, TFolder } from "obsidian";
import { FrontmatterService, Literal, VaultStateManager } from "architecture/plugin";
import { fnsManager } from "architecture/api";
import { HookEvent } from "./typing";

export class VaultHooks {
    // Cache to store the previous value of the monitored property for each file.
    private currentFrontmatter: FrontmatterService | null = null;

    public static setup(plugin: ZettelFlow) {
        new VaultHooks(plugin);
    }

    constructor(private plugin: ZettelFlow) {

        this.plugin.app.workspace.onLayoutReady(() => {
            // Register hooks for Vault events
            plugin.registerEvent(this.plugin.app.vault.on("rename", this.onRename, this.plugin));
            plugin.registerEvent(this.plugin.app.vault.on("delete", this.onDelete, this.plugin));
            plugin.registerEvent(this.plugin.app.vault.on("create", this.onCreate, this.plugin));

            // Register hooks for MetadataCache events
            plugin.registerEvent(this.plugin.app.metadataCache.on("changed", this.onCacheUpdate, this.plugin));

            // Register hooks for Workspace events
            plugin.registerEvent(this.plugin.app.workspace.on("file-open", this.onOpen, this.plugin));
            log.debug("Vault hooks setup with layout ready");
        });
    }

    private onRename = (file: TAbstractFile, oldPath: string) => {
        if (file instanceof TFolder) {
            this.onRenameFolder(file, oldPath);
        } else if (file instanceof TFile) {
            this.onRenameFile(file, oldPath);
        }
    };

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

    private onDelete = (file: TAbstractFile) => {
        if (file instanceof TFolder) {
            this.onDeleteFolder(file);
        } else if (file instanceof TFile) {
            this.onDeleteFile(file);
        }

    };

    private onDeleteFolder = (folder: TFolder) => {
        if (folder.path === this.plugin.settings.jsLibraryFolderPath) {
            this.plugin.settings.jsLibraryFolderPath = "";
            log.info("Deleted canvas file");
            this.plugin.saveSettings();
        } else {

            const potentialCanvasConfig = `${this.plugin.settings.foldersFlowsPath}/${folder.path.replace(/\//g, "_")}.canvas`;
            const potentialCanvasFile = this.plugin.app.vault.getAbstractFileByPath(potentialCanvasConfig);
            if (potentialCanvasFile) {
                canvas.flows.delete(potentialCanvasFile.path);
                this.plugin.app.vault.delete(potentialCanvasFile);
                log.info(`Deleted canvas file for folder ${folder.path}: ${potentialCanvasFile.path}`);
            }
        }
    }

    private onDeleteFile = (file: TFile) => {
        if (file.path === this.plugin.settings.ribbonCanvas) {
            canvas.flows.delete(file.path);
            this.plugin.settings.ribbonCanvas = "";
            this.plugin.saveSettings();
            log.info("Deleted canvas file");
        }
    }

    private onCreate = async (file: TAbstractFile) => {
        const parent = file.parent;
        if (!parent) {
            return;
        }
        const potentialCanvasConfig = `${this.plugin.settings.foldersFlowsPath}/${parent.path.replace(/\//g, "_")}.canvas`;
        const potentialCanvasFile = this.plugin.app.vault.getAbstractFileByPath(potentialCanvasConfig);
        if (potentialCanvasFile) {
            const flow = await canvas.flows.update(potentialCanvasFile.path);
            const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
            if (!activeView) {
                return;
            }
            new SelectorMenuModal(this.plugin.app, this.plugin, flow, activeView)
                .enableEditor(true)
                .open();
        }
    };

    private onOpen = (file: TFile | null) => {
        if (file instanceof TFile && file.extension === "md") {
            VaultStateManager.INSTANCE.activeFile(file);
            this.currentFrontmatter = FrontmatterService.instance(file);
            log.debug("Nuevo fichero abierto:", file.path);
        } else {
            VaultStateManager.INSTANCE.clean();
        }
    };

    // Event triggered when a file is modified.
    private onCacheUpdate = async (file: TFile, _data: string, cache: CachedMetadata) => {
        const hooks = Object.entries(this.plugin.settings.hooks.properties || {});
        if (!this.currentFrontmatter) {
            this.currentFrontmatter = FrontmatterService.instance(file);
            return;
        }
        // Verify that the global hook configuration is set and that the frontmatter is available.
        if (!hooks.length || !this.currentFrontmatter) return;
        // Just process markdown files.
        if (file.extension !== "md") return;

        // Skip if we're already updating from a hook to prevent recursion
        if (VaultStateManager.INSTANCE.isOnProcess(file.path)) {
            return;
        }

        VaultStateManager.INSTANCE.processStart(file.path);

        // Obtain the frontmatter of the file before and after the change.
        const oldFrontmatter = this.currentFrontmatter.getFrontmatter();
        const newFrontmatter: Record<string, any> = cache.frontmatter || {};
        const dynamicFrontmatter: Record<string, Literal> = {};
        // Remind the user that the frontmatter has changed.
        let event: HookEvent = {
            request: {
                oldValue: "",
                newValue: "",
                property: "",
                frontmatter: {}
            },
            file,
            response: {
                frontmatter: dynamicFrontmatter,
                removeProperties: []
            }
        }
        for (const hook of hooks) {
            const [property, hookSettings] = hook;
            const oldValue = oldFrontmatter[property];
            const newValue = newFrontmatter[property];

            if (oldValue !== newValue) {
                event.request = {
                    oldValue,
                    newValue,
                    property,
                    frontmatter: newFrontmatter
                };
                event = await this.executeHook(hookSettings.script, event);

                log.debug(`Hooks ${property} executed`, event);
            }
        }

        await this.currentFrontmatter.setProperties(
            event.response.frontmatter,
            event.response.removeProperties
        );

        // Update the current frontmatter.
        this.currentFrontmatter = FrontmatterService.instance(file);
        VaultStateManager.INSTANCE.processFinished(file.path);


        if (event.response.flowToTrigger) {

            // Remove potential file extension
            if (event.response.flowToTrigger.endsWith(".canvas")) {
                event.response.flowToTrigger = event.response.flowToTrigger.slice(0, -6);
            }
            // Build the path to the flow file
            const flowPath = `${this.plugin.settings.hooks.folderFlowPath}/${event.response.flowToTrigger}.canvas`;
            const flow = await canvas.flows.update(flowPath);
            const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
            if (!activeView) {
                return;
            }

            new SelectorMenuModal(this.plugin.app, this.plugin, flow, activeView)
                .enableEditor(true)
                .open();
        }
    };

    // Execute the script defined in the global hook configuration.
    private async executeHook(script: string, event: HookEvent): Promise<HookEvent> {
        try {
            const AsyncFunction = Object.getPrototypeOf(
                async function () { }
            ).constructor;
            const fnBody = `return (async () => {
                    ${script}
                    return event;
                  })(event, zf);`;

            const functions = await fnsManager.getFns();
            const scriptFn = new AsyncFunction(
                "event",
                "zf",
                fnBody
            );

            return await scriptFn(event, functions);
        } catch (error) {
            new Notice("Error executing global hook: " + error.message);
            throw error;
        }
    }
}