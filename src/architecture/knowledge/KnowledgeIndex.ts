import { Plugin, TAbstractFile, TFile } from "obsidian";
import { ObsidianApi, log } from "architecture";
import { KnowledgeModel } from "./model/KnowledgeModel";
import { deriveIdea, Idea } from "./model/Idea";
import type { KnowledgeSchemas } from "./model/schema";
import { gatherSnapshot } from "./snapshot";

export type KnowledgeIndexStatus = "idle" | "building" | "ready";

/**
 * The read-only, incremental index that models the vault as ideas — the foundation every later
 * epic layer reads from (#144). A `getInstance()` singleton behind the {@link ObsidianApi} facade.
 *
 * Guarantees: never writes to the vault (build/update are pure reads), rebuilds in memory on load
 * (decision #1 — no cache file), and updates a single entry per vault event (decision #4).
 */
export class KnowledgeIndex {
    private static instance: KnowledgeIndex | undefined;

    private readonly model = new KnowledgeModel();
    private schemas: KnowledgeSchemas = {};
    private currentStatus: KnowledgeIndexStatus = "idle";

    private constructor() {
        // singleton
    }

    public static getInstance(): KnowledgeIndex {
        if (!KnowledgeIndex.instance) {
            KnowledgeIndex.instance = new KnowledgeIndex();
        }
        return KnowledgeIndex.instance;
    }

    public get status(): KnowledgeIndexStatus {
        return this.currentStatus;
    }

    /** Read-only access to the model for the query surface and downstream consumers. */
    public getModel(): KnowledgeModel {
        return this.model;
    }

    /** Register concrete vocabularies (#146/#147/#148) before the (re)build that should use them. */
    public registerSchemas(schemas: KnowledgeSchemas): void {
        this.schemas = { ...this.schemas, ...schemas };
    }

    /** Rebuild the whole index from the vault. Synchronous, read-only (decisions #1 & #4). */
    public build(): void {
        this.currentStatus = "building";
        const start = Date.now();
        const ideas: Idea[] = ObsidianApi.vault()
            .getMarkdownFiles()
            .map((file) => deriveIdea(gatherSnapshot(file), this.schemas));
        this.model.build(ideas);
        this.currentStatus = "ready";
        log.debug(`[KnowledgeIndex] built ${ideas.length} ideas in ${Date.now() - start}ms`);
    }

    public onCreate(file: TAbstractFile): void {
        if (this.isMarkdown(file)) this.upsert(file);
    }

    public onModify(file: TAbstractFile): void {
        if (this.isMarkdown(file)) this.upsert(file);
    }

    public onDelete(file: TAbstractFile): void {
        if (this.isMarkdown(file)) this.model.remove(file.path);
    }

    public onRename(file: TAbstractFile, oldPath: string): void {
        if (this.isMarkdown(file)) this.model.rename(oldPath, file.path);
    }

    /**
     * Wire the four vault events (single-entry updates) and the initial build. Events are
     * registered through `plugin.registerEvent`, so they are removed automatically on unload.
     */
    public bootstrap(plugin: Plugin): void {
        const vault = ObsidianApi.vault();
        plugin.registerEvent(vault.on("create", (file) => this.onCreate(file)));
        plugin.registerEvent(vault.on("modify", (file) => this.onModify(file)));
        plugin.registerEvent(vault.on("delete", (file) => this.onDelete(file)));
        plugin.registerEvent(vault.on("rename", (file, oldPath) => this.onRename(file, oldPath)));
        plugin.app.workspace.onLayoutReady(() => this.build());
        // resolvedLinks may be incomplete before "resolved"; rebuild once when it fires.
        plugin.registerEvent(
            ObsidianApi.metadataCache().on("resolved", () => {
                if (this.currentStatus !== "ready") this.build();
            })
        );
    }

    private upsert(file: TFile): void {
        this.model.upsert(deriveIdea(gatherSnapshot(file), this.schemas));
        log.debug(`[KnowledgeIndex] upsert ${file.path}`);
    }

    private isMarkdown(file: TAbstractFile): file is TFile {
        return file instanceof TFile && file.extension === "md";
    }
}
