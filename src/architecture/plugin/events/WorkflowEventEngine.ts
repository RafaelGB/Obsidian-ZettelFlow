import ZettelFlow from "main";
import { CachedMetadata, EventRef, TAbstractFile, TFile } from "obsidian";
import { log } from "architecture";
import { canvas } from "architecture/plugin/canvas";
import { FileService, FILE_EXTENSIONS, VaultStateManager } from "architecture/plugin";
import { buildAsyncScriptFunction, fnsManager } from "architecture/api";
import { SelectorMenuModal } from "zettelkasten";
import { buildBindings, type FlowTriggerSource, type WorkflowBinding } from "./bindings";
import { deriveFrontmatterEvents } from "./derive";
import { dispatchEvent, type DispatchDeps, type DispatchResult } from "./dispatch";
import { ThrottleGate } from "./throttle";
import { CascadeGuard, type SelfWriteState } from "./loopGuard";
import type { WorkflowEventPayload } from "./vocabulary";

/** Debounce for the noisy metadataCache "changed" stream (mirrors the property-hook 60 ms). */
const METADATA_DEBOUNCE_MS = 60;

/**
 * The runtime orchestrator for event-driven workflows (#150). A `getInstance()` singleton (same shape
 * as `VaultStateManager`) that owns all Obsidian wiring; every decision is delegated to the pure event
 * core so this layer stays thin. It:
 *
 * - arms a **fixed** listener set (vault create/modify/delete + metadataCache changed) only while
 *   enabled, and disarms without a reload — every listener/timer is torn down on `disarm()` and on
 *   plugin unload (via `plugin.register`), so there are no leaks (AC-4, FR-8);
 * - builds the live binding set by **scanning the flows folder** (per-flow frontmatter triggers,
 *   OQ-3) and rebuilds it when a flow canvas changes;
 * - fires through the **same** `SelectorMenuModal` entry the ribbon/hooks use (FR-3);
 * - derives `property.changed` / `tag.added` from a frontmatter snapshot diff, and consults the
 *   `VaultStateManager` freeze/on-process state so a workflow's own write can't loop (FR-2, FR-7).
 */
export class WorkflowEventEngine {
    private static instance: WorkflowEventEngine | undefined;

    private armed = false;
    private eventRefs: EventRef[] = [];
    private readonly debounceTimers = new Map<string, number>();
    private readonly lastFrontmatter = new Map<string, Record<string, unknown>>();
    private bindings: WorkflowBinding[] = [];
    private readonly throttle = new ThrottleGate();
    private readonly cascade = new CascadeGuard();

    private constructor(private readonly plugin: ZettelFlow) {}

    /** Create the singleton, guarantee unload teardown, and arm if the feature is already enabled. */
    public static setup(plugin: ZettelFlow): WorkflowEventEngine {
        const engine = new WorkflowEventEngine(plugin);
        WorkflowEventEngine.instance = engine;
        // Teardown on unload even if disarm() is never called explicitly (no leaks, AC-4).
        plugin.register(() => engine.disarm());
        plugin.app.workspace.onLayoutReady(() => {
            if (plugin.settings.events?.enabled) engine.arm();
        });
        return engine;
    }

    public static getInstance(): WorkflowEventEngine {
        if (!WorkflowEventEngine.instance) {
            throw new Error("WorkflowEventEngine.setup(plugin) must run before getInstance()");
        }
        return WorkflowEventEngine.instance;
    }

    /** Register the fixed listener set and build the binding registry. Idempotent. */
    public arm(): void {
        if (this.armed) return;
        const vault = this.plugin.app.vault;
        const metadataCache = this.plugin.app.metadataCache;
        this.track(vault.on("create", this.onCreate));
        this.track(vault.on("modify", this.onModify));
        this.track(vault.on("delete", this.onDelete));
        this.track(metadataCache.on("changed", this.onMetadataChanged));
        this.armed = true;
        void this.rebuildBindings();
        log.info("[WorkflowEventEngine] Armed event-driven workflows.");
    }

    /** Remove every listener and timer and forget guard state. Idempotent; safe to call on unload. */
    public disarm(): void {
        if (!this.armed) return;
        const vault = this.plugin.app.vault;
        const metadataCache = this.plugin.app.metadataCache;
        for (const ref of this.eventRefs) {
            vault.offref(ref);
            metadataCache.offref(ref);
        }
        this.eventRefs = [];
        for (const handle of this.debounceTimers.values()) window.clearTimeout(handle);
        this.debounceTimers.clear();
        this.throttle.reset();
        this.cascade.reset();
        this.bindings = [];
        this.lastFrontmatter.clear();
        this.armed = false;
        log.info("[WorkflowEventEngine] Disarmed event-driven workflows.");
    }

    private track(ref: EventRef): void {
        // Tracked so disarm() can offref at runtime; unload teardown is guaranteed by the
        // plugin.register(() => disarm()) hook in setup(). (Not registerEvent — that can't be undone
        // for a runtime toggle-off and would accumulate dead closures across arm/disarm cycles.)
        this.eventRefs.push(ref);
    }

    // ── Listeners ─────────────────────────────────────────────────────────────
    private onCreate = (file: TAbstractFile): void => {
        if (!(file instanceof TFile)) return;
        if (this.isFlowCanvas(file)) {
            void this.rebuildBindings();
            return;
        }
        if (file.extension === "md") void this.dispatch({ event: "note.created", notePath: file.path });
    };

    private onModify = (file: TAbstractFile): void => {
        if (!(file instanceof TFile)) return;
        if (this.isFlowCanvas(file)) {
            void this.rebuildBindings();
            return;
        }
        if (file.extension === "md") void this.dispatch({ event: "note.modified", notePath: file.path });
    };

    private onDelete = (file: TAbstractFile): void => {
        if (!(file instanceof TFile)) return;
        this.lastFrontmatter.delete(file.path);
        if (this.isFlowCanvas(file)) void this.rebuildBindings();
    };

    private onMetadataChanged = (file: TFile, _data: string, cache: CachedMetadata): void => {
        if (file.extension !== "md") return;
        const previous = this.debounceTimers.get(file.path);
        if (previous) window.clearTimeout(previous);
        const handle = window.setTimeout(() => {
            this.debounceTimers.delete(file.path);
            this.processMetadata(file, cache);
        }, METADATA_DEBOUNCE_MS);
        this.debounceTimers.set(file.path, handle);
    };

    private processMetadata(file: TFile, cache: CachedMetadata): void {
        const newFrontmatter = copyFrontmatter(cache.frontmatter ?? {});
        // First sight of a note seeds the baseline (old === new → no derived events, no load noise).
        const oldFrontmatter = this.lastFrontmatter.get(file.path) ?? newFrontmatter;
        const derived = deriveFrontmatterEvents(file.path, oldFrontmatter, newFrontmatter);
        this.lastFrontmatter.set(file.path, newFrontmatter);
        for (const payload of derived) void this.dispatch(payload);
    }

    // ── Dispatch wiring ─────────────────────────────────────────────────────────
    private dispatch(payload: WorkflowEventPayload): Promise<DispatchResult[]> {
        const deps: DispatchDeps = {
            enabled: () => this.plugin.settings.events?.enabled ?? false,
            bindings: () => this.bindings,
            selfWriteState: () => this.selfWriteState(payload.notePath),
            throttle: this.throttle,
            cascade: this.cascade,
            runScript: this.runScript,
            runWorkflow: this.runWorkflow,
            now: () => Date.now(),
        };
        return dispatchEvent(payload, deps);
    }

    private selfWriteState(notePath: string): SelfWriteState {
        const state = VaultStateManager.INSTANCE;
        return {
            frozen: state.isFreezed(),
            onProcessPaths: state.isOnProcess(notePath) ? [notePath] : [],
        };
    }

    /** Fire a bound workflow through the SAME entry as a manual run (FR-3). */
    private runWorkflow = async (binding: WorkflowBinding): Promise<void> => {
        const flow = await canvas.flows.update(binding.flowPath);
        new SelectorMenuModal(this.plugin.app, this.plugin, flow).open();
    };

    /** Evaluate a binding condition as a `zf` script (same evaluator as hooks / the Script action). */
    private runScript = async (script: string, ctx: unknown): Promise<unknown> => {
        const fnBody = `return (async () => {\n${script}\n})();`;
        const functions = await fnsManager.getFns();
        const scriptFn = buildAsyncScriptFunction(["event", "zf"], fnBody);
        return await scriptFn(ctx, functions);
    };

    // ── Binding registry (flow-folder scan) ──────────────────────────────────────
    private async rebuildBindings(): Promise<void> {
        this.bindings = await this.scanTriggers();
        log.debug(`[WorkflowEventEngine] Rebuilt ${this.bindings.length} trigger binding(s).`);
    }

    /**
     * Scan the flows folder and resolve every per-flow trigger into a binding. Read-only (no arm
     * required) so the settings management list can call it directly.
     */
    public async scanTriggers(): Promise<WorkflowBinding[]> {
        const folder = this.plugin.settings.foldersFlowsPath;
        if (!folder) return [];
        try {
            const files = FileService.getTfilesFromFolder(folder, FILE_EXTENSIONS.ONLY_CANVAS);
            const sources: FlowTriggerSource[] = [];
            for (const file of files) {
                try {
                    const flow = await canvas.flows.update(file.path);
                    const roots = await flow.rootNodes();
                    sources.push({
                        flowPath: file.path,
                        roots: roots.map((root) => ({
                            nodeId: root.id,
                            filePath: root.path,
                            trigger: root.trigger,
                        })),
                    });
                } catch (error) {
                    log.warn(`[WorkflowEventEngine] Could not scan flow ${file.path}`, error);
                }
            }
            return buildBindings(sources);
        } catch (error) {
            log.error("[WorkflowEventEngine] Failed to scan trigger bindings.", error);
            return [];
        }
    }

    // ── Management (file-node roots only — the v1 authoring path) ────────────────
    /** Toggle a trigger's `enabled` flag in its root step's frontmatter. Re-scans afterwards. */
    public async setTriggerEnabled(binding: WorkflowBinding, enabled: boolean): Promise<void> {
        await this.mutateTrigger(binding, (settings) => {
            const trigger = settings.trigger as Record<string, unknown> | undefined;
            if (trigger) trigger.enabled = enabled;
        });
    }

    /** Remove a trigger entirely from its root step's frontmatter. Re-scans afterwards. */
    public async removeTrigger(binding: WorkflowBinding): Promise<void> {
        await this.mutateTrigger(binding, (settings) => {
            delete settings.trigger;
        });
    }

    private async mutateTrigger(
        binding: WorkflowBinding,
        mutate: (settings: Record<string, unknown>) => void
    ): Promise<void> {
        if (!binding.filePath) {
            log.warn("[WorkflowEventEngine] Cannot edit a trigger that has no root file (edit it in the canvas).");
            return;
        }
        const file = this.plugin.app.vault.getAbstractFileByPath(binding.filePath);
        if (!(file instanceof TFile)) return;
        await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
            const settings = frontmatter.zettelFlowSettings as Record<string, unknown> | undefined;
            if (settings) mutate(settings);
        });
        // The step file changed (not the canvas), so force the flow cache to re-read, then re-scan.
        canvas.flows.delete(binding.flowPath);
        if (this.armed) await this.rebuildBindings();
    }

    private isFlowCanvas(file: TFile): boolean {
        if (file.extension !== "canvas") return false;
        const folder = this.plugin.settings.foldersFlowsPath;
        return !folder || file.path.startsWith(folder);
    }
}

/** JSON-safe deep copy of a frontmatter snapshot (the cache object is mutated in place by Obsidian). */
function copyFrontmatter(frontmatter: Record<string, unknown>): Record<string, unknown> {
    try {
        return JSON.parse(JSON.stringify(frontmatter)) as Record<string, unknown>;
    } catch {
        return { ...frontmatter };
    }
}
