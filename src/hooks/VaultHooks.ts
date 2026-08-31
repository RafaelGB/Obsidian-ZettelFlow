import ZettelFlow from "main";
import { canvas } from "architecture/plugin/canvas";
import type { Flow } from "architecture/plugin/canvas";
import { log } from "architecture";
import { SelectorMenuModal } from "zettelkasten";
import {
    App,
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
import { buildAsyncScriptFunction, fnsManager } from "architecture/api";
import { evaluateBindingCondition } from "architecture/plugin/events/condition";

import { hasFrontmatterMutations, copyFrontmatter, changedHookProperties } from "./utils/CompareUtils";
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
    HookResponse,
    HookSettings,
} from "./typing";

/** Outcome of a hook dry-run (#327 S5): what a real property change *would* do, without writing. */
export type HookDryRunResult =
    | { status: "ran"; response: HookResponse }
    | { status: "skipped" }
    | { status: "no-file" }
    | { status: "error"; message: string };

/** Ajustable si ves muchos "changed" por tecleo. */
const METADATA_DEBOUNCE_MS = 60;
/** TTL del cache de FrontmatterService, igual que el original (60s). */
const FRONTMATTER_CACHE_TTL_MS = 60_000;

export class VaultHooks {
    private debounceTimers: Map<string, number> = new Map();
    private revokeTimers: Map<string, number> = new Map();
    /**
     * Independent, copied frontmatter snapshot per file, used as the "previous" value when
     * detecting property changes. Kept separate from Obsidian's metadata cache because that
     * cache is mutated in place — reading it as "old" made every property look unchanged and
     * was why property hooks never fired.
     */
    private lastFrontmatter: Map<string, Record<string, unknown>> = new Map();

    public static setup(plugin: ZettelFlow) {
        new VaultHooks(plugin);
    }

    /**
     * Dry-run a hook against the **active note** without writing (#327 S5). Simulates the property having
     * just changed to its current value, evaluates the optional condition, runs the script, and returns
     * the mutations it *would* apply. Read-only: it never touches the vault.
     */
    public static async dryRun(app: App, property: string, settings: HookSettings): Promise<HookDryRunResult> {
        const file = app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return { status: "no-file" };

        const frontmatter = copyFrontmatter(app.metadataCache.getFileCache(file)?.frontmatter ?? {});
        const newValue = frontmatter[property];
        try {
            const zf = await fnsManager.getFns();

            const condition = settings.condition?.trim();
            if (condition) {
                const ctx = { event: "property.changed", notePath: file.path, property, oldValue: undefined, newValue };
                const condFn = buildAsyncScriptFunction(["event", "zf"], `return (${condition});`);
                const passes = await condFn(ctx, zf);
                if (!passes) return { status: "skipped" };
            }

            const event: HookEvent = {
                file,
                request: { oldValue: undefined, newValue, property, frontmatter },
                response: { frontmatter: {}, removeProperties: [] },
            };
            const scriptFn = buildAsyncScriptFunction(["event", "zf"], `return (async () => {\n${settings.script}\n return event;\n})(event, zf);`);
            const result = (await scriptFn(event, zf)) as HookEvent;
            return { status: "ran", response: result.response };
        } catch (error) {
            return { status: "error", message: error instanceof Error ? error.message : String(error) };
        }
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

    /**
     * When a file is renamed, we check if it is a folder or a file. Then we handle it accordingly.
     * @param file The file that was renamed.
     * @param oldPath The old path of the file before renaming.
     */
    private onRename = (file: TAbstractFile, oldPath: string) => {
        if (VaultStateManager.INSTANCE.isFreezed()) return;

        if (isFolder(file)) {
            this.onRenameFolder(file, oldPath);
        } else if (file instanceof TFile) {
            this.onRenameFile(file, oldPath);
        }
    };

    private onRenameFolder(folder: TFolder, oldPath: string) {
        const settings = this.plugin.settings;
        const { foldersFlowsPath } = settings;

        // The scripts library is a *folder* path, so its rename arrives here (not in onRenameFile).
        // Keep the setting in sync and refresh the `zf` script API so it reads from the new path.
        if (oldPath === settings.jsLibraryFolderPath) {
            settings.jsLibraryFolderPath = folder.path;
            void this.plugin.saveSettings();
            fnsManager.invalidateCache();
            log.info("[VaultHooks] Renamed jsLibraryFolderPath.");
        }

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
        this.lastFrontmatter.delete(oldPath);

        if (oldPath === settings.ribbonCanvas) {
            canvas.flows.delete(oldPath);
            settings.ribbonCanvas = file.path;
            void this.plugin.saveSettings();
            log.info("[VaultHooks] Renombrado ribbonCanvas.");
        }
        // jsLibraryFolderPath is a folder path, so its rename is handled in onRenameFolder.
    }

    /**
     * When a file is modified, we invalidate the flow cache.
     * @param file The file that was modified.
     */
    private onModify = (file: TAbstractFile) => {
        if (VaultStateManager.INSTANCE.isFreezed()) return;

        if (isCanvasFile(file)) {
            canvas.flows.delete(file.path);
            log.debug("[VaultHooks] Invalida flow cache por modificación:", file.path);
        }
    };

    /**
     * When a file is deleted, we check if it is a folder or a file. Then we handle it accordingly.
     * @param file The file that was deleted.
     */
    private onDelete = (file: TAbstractFile) => {
        if (VaultStateManager.INSTANCE.isFreezed()) return;

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
            void this.plugin.saveSettings();
            fnsManager.invalidateCache();
            log.info("[VaultHooks] Removed jsLibraryFolderPath.");
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
            this.plugin.app.fileManager
                .trashFile(canvasFile)
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
        this.lastFrontmatter.delete(file.path);
        if (file.path === this.plugin.settings.ribbonCanvas) {
            canvas.flows.delete(file.path);
            this.plugin.settings.ribbonCanvas = "";
            void this.plugin.saveSettings();
            log.info("[VaultHooks] Eliminado ribbonCanvas.");
        }
    };

    /**
     * When a file is created, we check if it is a folder or a file. Then we handle it accordingly.
     * @param file The file that was created.
     */
    private onCreate = async (file: TAbstractFile) => {
        if (VaultStateManager.INSTANCE.isFreezed()) return;

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

    /**
     * When a file is opened, we check if it is a markdown file and add it to the VaultStateManager.
     * @param file The file that was opened.
     */
    private onOpen = (file: TFile | null) => {
        if (VaultStateManager.INSTANCE.isFreezed()) return;

        if (isMarkdownFile(file)) {
            VaultStateManager.INSTANCE.add(file);
            // Seed the change-detection baseline with the current frontmatter so the first
            // property edit after opening is detected as a change.
            this.lastFrontmatter.set(
                file.path,
                copyFrontmatter(this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {})
            );
            log.debug("[VaultHooks] Opened file:", file.path);
        }
    };

    // ========== MetadataCache: changed ==========
    private onCacheUpdate = (file: TFile, _data: string, cache: CachedMetadata) => {
        if (
            VaultStateManager.INSTANCE.isFreezed() ||
            VaultStateManager.INSTANCE.isOnProcess(file.path)
        ) {
            return;
        }
        // Sólo nos interesan markdowns
        if (file.extension !== "md") return;

        // Debounce por fichero
        const previous = this.debounceTimers.get(file.path);
        if (previous) window.clearTimeout(previous);

        const handle = window.setTimeout(
            () => {
                this.processMetadataChange(file, cache).catch((e) => {
                    log.error("[VaultHooks] Error procesando metadata change:", e);
                });
            },
            METADATA_DEBOUNCE_MS
        );

        this.debounceTimers.set(file.path, handle);
    };

    private async processMetadataChange(file: TFile, cache: CachedMetadata) {
        const hooksCfg: HooksConfig = this.plugin.settings.hooks || {
            properties: {},
            folderFlowPath: "",
        };

        const hooksEntries = Object.entries(hooksCfg.properties || {});
        if (!hooksEntries.length) return;

        // Service used only to WRITE any hook response mutations.
        const fmPrev = this.getOrCreateFrontmatterService(file);
        // Compare against our own copied snapshot, never the live metadata cache: Obsidian
        // mutates getFileCache().frontmatter in place, which made old === new and stopped
        // property hooks from ever firing.
        const newFrontmatter: Record<string, unknown> = copyFrontmatter(cache.frontmatter ?? {});
        const oldFrontmatter: Record<string, unknown> = this.lastFrontmatter.get(file.path) ?? newFrontmatter;
        const changed = new Set(
            changedHookProperties(hooksEntries.map(([property]) => property), oldFrontmatter, newFrontmatter)
        );

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
                if (!changed.has(property)) continue;
                // A disabled hook is paused, not deleted (#327 S3).
                if (hookSettings.enabled === false) continue;

                event.request = {
                    oldValue: oldFrontmatter[property],
                    newValue: newFrontmatter[property],
                    property,
                    frontmatter: newFrontmatter,
                };

                // Optional run condition (#327 S4): skip the script when it does not hold.
                const passes = await this.evaluateHookCondition(hookSettings.condition, {
                    event: "property.changed",
                    notePath: file.path,
                    property,
                    oldValue: oldFrontmatter[property],
                    newValue: newFrontmatter[property],
                });
                if (!passes) {
                    log.debug(`[VaultHooks] Hook for "${property}" skipped by its condition.`);
                    continue;
                }

                event = await this.executeHook(hookSettings.script, event);
                log.debug(`[VaultHooks] Hook executed with property "${property}".`, event);
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

                VaultStateManager.INSTANCE.update(file);
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

            // Remember the latest frontmatter so the next change diffs against it.
            this.lastFrontmatter.set(file.path, newFrontmatter);

            // Revoke cache after processing. Cancel any previous timer.
            const previous = this.revokeTimers.get(file.path);
            if (previous) window.clearTimeout(previous);

            const revokeTimer = window.setTimeout(() => {
                VaultStateManager.INSTANCE.remove(file.path);
                log.info(`[VaultHooks] Revoke frontmatter cache for ${file.path}`);
            }, FRONTMATTER_CACHE_TTL_MS);
            this.revokeTimers.set(file.path, revokeTimer);
        }
    }

    // ========== Helpers ==========

    private getOrCreateFrontmatterService(file: TFile): FrontmatterService {
        let svc = VaultStateManager.INSTANCE.get(file.path);
        if (!svc) {
            return VaultStateManager.INSTANCE.add(file).frontmatter;
        }
        return svc.frontmatter;
    }

    private async openFlowSelectorIfActive(flow: Flow) {
        const activeView =
            this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) return;

        new SelectorMenuModal(this.plugin.app, this.plugin, flow, activeView)
            .enableEditor(true)
            .open();
    }

    /**
     * Evaluate a hook's optional run condition (#327 S4). Blank/absent → always runs. The condition is a
     * `zf` expression evaluated against a change-event context bound to `event` (mirroring the guided
     * condition help vocabulary: `event.property`, `event.oldValue`, `event.newValue`, `event.notePath`).
     * Reuses {@link evaluateBindingCondition}, so a throw is contained → the hook is safely skipped.
     */
    private evaluateHookCondition(condition: string | undefined, ctx: unknown): Promise<boolean> {
        return evaluateBindingCondition(condition, ctx, async (script, context) => {
            const zf = await fnsManager.getFns();
            const fn = buildAsyncScriptFunction(["event", "zf"], `return (${script});`);
            return fn(context, zf);
        });
    }

    private async executeHook(script: string, event: HookEvent): Promise<HookEvent> {
        try {
            const fnBody = `return (async () => {
        ${script}
        return event;
      })(event, zf);`;

            const functions = await fnsManager.getFns();
            const scriptFn = buildAsyncScriptFunction(["event", "zf"], fnBody);

            return (await scriptFn(event, functions)) as HookEvent;
        } catch (error: unknown) {
            const msg = error instanceof Error
                ? error.message
                : typeof error === "string" ? error : JSON.stringify(error);
            new Notice("Error executing global hook: " + msg);
            log.error("[VaultHooks] Error ejecutando script de hook:", error);
            throw error;
        }
    }
}
