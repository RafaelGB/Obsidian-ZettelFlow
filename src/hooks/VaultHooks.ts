import ZettelFlow from "main";
import { canvas } from 'architecture/plugin/canvas';
import { log } from "architecture";
import { SelectorMenuModal } from "zettelkasten";
import { MarkdownView, Notice, TFile, TFolder } from "obsidian";
import { checkSemaphore, FrontmatterService, Literal } from "architecture/plugin";
import { fnsManager } from "architecture/api";
import { HookEvent } from "./typing";

export class VaultHooks {
    // Cache to store the previous value of the monitored property for each file.
    private currentFrontmatter: FrontmatterService | null = null;
    // Flag to prevent hook recursion
    private isHookUpdating: boolean = false;

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
            log.debug("Nuevo fichero abierto:", file.path);
        } else {
            this.currentFrontmatter = null;
        }
    });

    // Event triggered when a file is modified.
    private onCacheUpdate = this.plugin.app.metadataCache.on("changed", async (file, _data, cache) => {
        const hooks = Object.entries(this.plugin.settings.propertyHooks || {});
        if (!this.currentFrontmatter) {
            this.currentFrontmatter = FrontmatterService.instance(file);
            return;
        }
        // Verify that the global hook configuration is set and that the frontmatter is available.
        if (!hooks.length || !this.currentFrontmatter) return;
        // Just process markdown files.
        if (file.extension !== "md") return;

        // Skip if we're already updating from a hook to prevent recursion
        if (this.isHookUpdating) {
            this.isHookUpdating = false;
            return;
        }
        this.isHookUpdating = true;

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
                frontmatter: dynamicFrontmatter
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
            }
        }

        await this.currentFrontmatter.setProperties(event.response.frontmatter);
        // Update the current frontmatter.
        this.currentFrontmatter = FrontmatterService.instance(file);
        this.isHookUpdating = false;
    });

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