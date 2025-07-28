import ZettelFlow from "main";
import { canvas } from "architecture/plugin/canvas";
import { log } from "architecture";
import { SelectorMenuModal } from "zettelkasten";
import {
    CachedMetadata,
    MarkdownView,
    Notice,
    TAbstractFile,
    TFile,
    TFolder,
} from "obsidian";
import {
    FrontmatterService,
    Literal,
    VaultStateManager,
} from "architecture/plugin";
import { fnsManager } from "architecture/api";

import { valuesEqual, hasFrontmatterMutations } from "./utils/CompareUtils";
import {
    isCanvasFile,
    isFolder,
    isMarkdownFile,
} from "./utils/FileUtils";
import {
    canvasPathFromFolder,
    canvasPathFromFlowName,
} from "./utils/PathUtils";

import type {
    HookEvent,
    HooksConfig,
    PropertiesHooksConfig,
} from "./typing";

/** Ajustable si ves muchos "changed" por tecleo. */
const METADATA_DEBOUNCE_MS = 60;
/** TTL del cache de FrontmatterService, igual que el original (60s). */
const FRONTMATTER_CACHE_TTL_MS = 60_000;

export class VaultHooks {
    private currentFrontmatter: Map<string, FrontmatterService> = new Map();
    private debounceTimers: Map<string, number> = new Map();

    public static setup(plugin: ZettelFlow) {
        new VaultHooks(plugin);
    }

    constructor(private plugin: ZettelFlow) {
        this.plugin.app.workspace.onLayoutReady(() => {
            // Vault
            plugin.registerEvent(
                this.plugin.app.vault.on("rename", this.onRename, this)
            );
            plugin.registerEvent(
                this.plugin.app.vault.on("delete", this.onDelete, this)
            );
            plugin.registerEvent(
                this.plugin.app.vault.on("create", this.onCreate, this)
            );
            plugin.registerEvent(
                this.plugin.app.vault.on("modify", this.onModify, this)
            );

            // Metadata cache
            plugin.registerEvent(
                this.plugin.app.metadataCache.on("changed", this.onCacheUpdate, this)
            );

            // Workspace
            plugin.registerEvent(
                this.plugin.app.workspace.on("file-open", this.onOpen, this)
            );

            log.debug("[VaultHooks] Registed hooks (onLayoutReady).");
        });
    }

    // ========== Vault: rename ==========
    private onRename = (file: TAbstractFile, oldPath: string) => {
        if (isFolder(file)) {
            this.onRenameFolder(file, oldPath);
        } else if (file instanceof TFile) {
            this.onRenameFile(file, oldPath);
        }
    };

    private onRenameFolder(folder: TFolder, oldPath: string) {
        const { foldersFlowsPath } = this.plugin.settings;
        const oldCanvas = canvasPathFromFolder(foldersFlowsPath, oldPath);
        const candidate = this.plugin.app.vault.getAbstractFileByPath(oldCanvas);

        if (candidate) {
            const newCanvas = canvasPathFromFolder(foldersFlowsPath, folder.path);
            this.plugin.app.vault
                .rename(candidate, newCanvas)
                .then(() =>
                    log.info(
                        `[VaultHooks] Renaming folder canvas from ${oldCanvas} to ${newCanvas}`
                    )
                )
                .catch((e) =>
                    log.error(
                        `[VaultHooks] Error renaming canvas from ${oldCanvas} to ${newCanvas}:`,
                        e
                    )
                );
        }
    }

    private onRenameFile(file: TFile, oldPath: string) {
        const settings = this.plugin.settings;

        if (oldPath === settings.ribbonCanvas) {
            canvas.flows.delete(oldPath);
            settings.ribbonCanvas = file.path;
            this.plugin.saveSettings();
            log.info("[VaultHooks] Renombrado ribbonCanvas.");
        } else if (oldPath === settings.jsLibraryFolderPath) {
            settings.jsLibraryFolderPath = file.path;
            this.plugin.saveSettings();
            log.info("[VaultHooks] Renombrado jsLibraryFolderPath.");
        }
    }

    // ========== Vault: modify ==========
    private onModify = (file: TAbstractFile) => {
        if (isCanvasFile(file)) {
            canvas.flows.delete(file.path);
            log.debug("[VaultHooks] Invalida flow cache por modificación:", file.path);
        }
    };

    // ========== Vault: delete ==========
    private onDelete = (file: TAbstractFile) => {
        if (isFolder(file)) {
            this.onDeleteFolder(file);
        } else if (file instanceof TFile) {
            this.onDeleteFile(file);
        }
    };

    private onDeleteFolder = (folder: TFolder) => {
        const settings = this.plugin.settings;

        if (folder.path === settings.jsLibraryFolderPath) {
            settings.jsLibraryFolderPath = "";
            this.plugin.saveSettings();
            log.info("[VaultHooks] Eliminada jsLibraryFolderPath.");
            return;
        }

        const canvasPath = canvasPathFromFolder(
            settings.foldersFlowsPath,
            folder.path
        );
        const canvasFile =
            this.plugin.app.vault.getAbstractFileByPath(canvasPath);

        if (canvasFile instanceof TFile) {
            canvas.flows.delete(canvasFile.path);
            this.plugin.app.vault
                .delete(canvasFile)
                .then(() =>
                    log.info(
                        `[VaultHooks] Eliminado canvas asociado a carpeta ${folder.path}: ${canvasFile.path}`
                    )
                )
                .catch((e) =>
                    log.error(
                        `[VaultHooks] Error eliminando canvas ${canvasFile.path}:`,
                        e
                    )
                );
        }
    };

    private onDeleteFile = (file: TFile) => {
        if (file.path === this.plugin.settings.ribbonCanvas) {
            canvas.flows.delete(file.path);
            this.plugin.settings.ribbonCanvas = "";
            this.plugin.saveSettings();
            log.info("[VaultHooks] Eliminado ribbonCanvas.");
        }
    };

    // ========== Vault: create ==========
    private onCreate = async (file: TAbstractFile) => {
        const parent = file.parent;
        if (!parent) return;

        const potentialCanvasConfig = canvasPathFromFolder(
            this.plugin.settings.foldersFlowsPath,
            parent.path
        );
        const potentialCanvasFile =
            this.plugin.app.vault.getAbstractFileByPath(potentialCanvasConfig);

        if (potentialCanvasFile instanceof TFile) {
            try {
                const flow = await canvas.flows.update(potentialCanvasFile.path);
                await this.openFlowSelectorIfActive(flow);
            } catch (e) {
                log.error("[VaultHooks] Error abriendo selector tras create:", e);
            }
        }
    };

    // ========== Workspace: file-open ==========
    private onOpen = (file: TFile | null) => {
        if (isMarkdownFile(file)) {
            VaultStateManager.INSTANCE.activeFile(file);
            this.currentFrontmatter.set(file.path, FrontmatterService.instance(file));
            log.debug("[VaultHooks] Fichero abierto:", file.path);
        } else {
            VaultStateManager.INSTANCE.clean();
        }
    };

    // ========== MetadataCache: changed ==========
    private onCacheUpdate = (file: TFile, _data: string, cache: CachedMetadata) => {
        // Sólo nos interesan markdowns
        if (file.extension !== "md") return;

        // Debounce por fichero
        const previous = this.debounceTimers.get(file.path);
        if (previous) window.clearTimeout(previous);

        const handle = window.setTimeout(
            () => this.processMetadataChange(file, cache).catch((e) => {
                log.error("[VaultHooks] Error procesando metadata change:", e);
            }),
            METADATA_DEBOUNCE_MS
        );

        this.debounceTimers.set(file.path, handle);
    };

    private async processMetadataChange(file: TFile, cache: CachedMetadata) {
        const hooksCfg: HooksConfig = this.plugin.settings.hooks || {
            properties: {},
            folderFlowPath: "",
        };

        const hooksEntries = Object.entries(
            (hooksCfg.properties || {}) as PropertiesHooksConfig
        );
        if (!hooksEntries.length) return;

        // Evita recursión o desactivación global
        if (
            !VaultStateManager.INSTANCE.isGlobalEnabled() ||
            VaultStateManager.INSTANCE.isOnProcess(file.path)
        ) {
            return;
        }

        // Asegura servicio de frontmatter previo
        const fmPrev = this.getOrCreateFrontmatterService(file);
        const oldFrontmatter = fmPrev.getFrontmatter() ?? {};
        const newFrontmatter: Record<string, unknown> = cache.frontmatter || {};

        const dynamicFrontmatter: Record<string, Literal> = {};
        let event: HookEvent = {
            file,
            request: {
                oldValue: "",
                newValue: "",
                property: "",
                frontmatter: newFrontmatter,
            },
            response: {
                frontmatter: dynamicFrontmatter,
                removeProperties: [],
            },
        };

        VaultStateManager.INSTANCE.processStart(file.path);

        try {
            for (const [property, hookSettings] of hooksEntries) {
                const oldValue = (oldFrontmatter as any)[property];
                const newValue = (newFrontmatter as any)[property];

                if (!valuesEqual(oldValue, newValue)) {
                    event.request = {
                        oldValue,
                        newValue,
                        property,
                        frontmatter: newFrontmatter,
                    };

                    event = await this.executeHook(hookSettings.script, event);
                    log.debug(`[VaultHooks] Hook executed with property "${property}".`, event);
                }
            }

            if (
                event.response &&
                hasFrontmatterMutations(
                    event.response.frontmatter,
                    event.response.removeProperties
                )
            ) {
                await fmPrev.setProperties(
                    event.response.frontmatter,
                    event.response.removeProperties
                );
                // Refresca el servicio tras escribir
                this.currentFrontmatter.set(file.path, FrontmatterService.instance(file));
            }

            // Disparar flow si procede y el archivo es el activo
            if (
                event.response.flowToTrigger &&
                file.path === this.plugin.app.workspace.getActiveFile()?.path
            ) {
                const flowPath = canvasPathFromFlowName(
                    hooksCfg.folderFlowPath,
                    event.response.flowToTrigger
                );
                const flow = await canvas.flows.update(flowPath);
                await this.openFlowSelectorIfActive(flow);
            }
        } finally {
            VaultStateManager.INSTANCE.processFinished(file.path);

            // Revoke cache after processing
            window.setTimeout(() => {
                this.currentFrontmatter.delete(file.path);
                log.info(`[VaultHooks] Revoke frontmatter cache for ${file.path}`);
            }, FRONTMATTER_CACHE_TTL_MS);
        }
    }

    // ========== Helpers ==========

    private getOrCreateFrontmatterService(file: TFile): FrontmatterService {
        let svc = this.currentFrontmatter.get(file.path);
        if (!svc) {
            svc = FrontmatterService.instance(file);
            this.currentFrontmatter.set(file.path, svc);
        }
        return svc;
    }

    private async openFlowSelectorIfActive(flow: any) {
        const activeView =
            this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) return;

        new SelectorMenuModal(this.plugin.app, this.plugin, flow, activeView)
            .enableEditor(true)
            .open();
    }

    private async executeHook(script: string, event: HookEvent): Promise<HookEvent> {
        try {
            const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
            const fnBody = `return (async () => {
        ${script}
        return event;
      })(event, zf);`;

            const functions = await fnsManager.getFns();
            const scriptFn = new AsyncFunction("event", "zf", fnBody);

            return await scriptFn(event, functions);
        } catch (error: any) {
            const msg = error?.message ?? String(error);
            new Notice("Error executing global hook: " + msg);
            log.error("[VaultHooks] Error ejecutando script de hook:", error);
            throw error;
        }
    }
}
