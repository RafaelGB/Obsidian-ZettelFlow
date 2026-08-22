import { App } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import { buildKnowledgeMap, Cluster, KnowledgeMap } from "architecture/knowledge/state";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";

const DEBOUNCE_MS = 400;

type ViewState = "indexing" | "ready" | "empty" | "error";

function basename(path: string): string {
    const file = path.split("/").pop() ?? path;
    return file.replace(/\.md$/i, "");
}

/**
 * The **Map** mode of the Graph surface (#272, formerly `KnowledgeMapView`, #164): detects your hubs
 * and the notes orbiting each one, auto-updating as the vault changes. Read-only; render byte-identical.
 */
export class KnowledgeMapRenderer extends KnowledgeModeRenderer {
    private state: ViewState = "indexing";
    private map: KnowledgeMap | null = null;
    private debounceTimer: number | undefined;

    constructor(container: HTMLElement, private readonly app: App) {
        super(container);
    }

    onload(): void {
        this.registerVaultListeners();
        this.recompute();
    }

    onunload(): void {
        window.clearTimeout(this.debounceTimer);
        this.container.empty();
    }

    private registerVaultListeners(): void {
        const debounced = () => {
            window.clearTimeout(this.debounceTimer);
            this.debounceTimer = window.setTimeout(() => this.recompute(), DEBOUNCE_MS);
        };
        this.registerEvent(this.app.metadataCache.on("resolved", debounced));
        this.registerEvent(this.app.vault.on("rename", debounced));
        this.registerEvent(this.app.vault.on("delete", debounced));
    }

    private recompute(): void {
        try {
            const index = KnowledgeIndex.getInstance();
            if (index.status !== "ready") {
                this.state = "indexing";
                this.render();
                return;
            }
            const start = Date.now();
            this.map = buildKnowledgeMap(index.getModel());
            this.state = this.map.clusters.length === 0 && this.map.unclustered.length === 0 ? "empty" : "ready";
            log.debug(`[KnowledgeMap] built ${this.map.clusters.length} clusters in ${Date.now() - start}ms`);
        } catch (error) {
            this.state = "error";
            log.error(`[KnowledgeMap] build failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
        this.render();
    }

    private render(): void {
        const host = this.container;
        host.empty();
        const container = host.createDiv({ cls: c("knowledge-map") });

        const header = container.createDiv({ cls: c("knowledge-map-header") });
        header.createEl("h4", { text: t("knowledge_map_view_title"), cls: c("knowledge-map-title") });
        const refresh = header.createEl("button", {
            text: t("knowledge_map_refresh_button"),
            cls: c("knowledge-map-refresh"),
            attr: { "aria-label": t("knowledge_map_refresh_button") },
        });
        // Plain listener on a per-render element: it's GC'd with the node on the next empty().
        refresh.addEventListener("click", () => this.recompute());

        if (this.state === "indexing") {
            container.createDiv({ cls: c("knowledge-map-status"), text: t("knowledge_map_indexing") });
            return;
        }
        if (this.state === "error") {
            container.createDiv({ cls: c("knowledge-map-status"), text: t("knowledge_map_error") });
            return;
        }
        if (this.state === "empty" || !this.map) {
            container.createDiv({ cls: c("knowledge-map-status"), text: t("knowledge_map_empty") });
            return;
        }

        for (const cluster of this.map.clusters) this.renderCluster(container, cluster);
        if (this.map.unclustered.length > 0) {
            const section = container.createDiv({ cls: c("knowledge-map-cluster") });
            section.createEl("h5", { text: t("knowledge_map_unclustered_heading"), cls: c("knowledge-map-hub") });
            const list = section.createDiv({ cls: c("knowledge-map-members") });
            for (const path of this.map.unclustered) this.renderRow(list, path);
        }
    }

    private renderCluster(container: HTMLElement, cluster: Cluster): void {
        const section = container.createDiv({ cls: c("knowledge-map-cluster") });
        const head = section.createEl("h5", { cls: c("knowledge-map-hub") });
        const name = head.createSpan({ text: basename(cluster.hub), cls: c("knowledge-map-hub-name") });
        name.setAttribute("title", cluster.hub);
        name.addEventListener("click", () => void this.app.workspace.openLinkText(cluster.hub, "", false));
        head.createSpan({
            text: ` · ${t("knowledge_map_member_count", String(cluster.members.length))}`,
            cls: c("knowledge-map-count"),
        });
        const list = section.createDiv({ cls: c("knowledge-map-members") });
        for (const path of cluster.members) this.renderRow(list, path);
    }

    private renderRow(list: HTMLElement, path: string): void {
        const row = list.createDiv({ cls: c("knowledge-map-member") });
        const name = row.createSpan({ text: basename(path), cls: c("knowledge-map-member-name") });
        name.setAttribute("title", path);
        name.addEventListener("click", () => void this.app.workspace.openLinkText(path, "", false));
    }
}
