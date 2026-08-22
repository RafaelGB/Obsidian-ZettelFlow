import { App } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import { build3DGraph, Graph3DData, RELATION_COLOR_VARS } from "architecture/knowledge/state";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
// Type-only import — erased at compile time, so the heavy WebGL library is pulled in *lazily* via the
// dynamic import() in mountGraph(), never at plugin load (#280 S1, FR-4).
import type { ForceGraph3DInstance } from "3d-force-graph";

const DEBOUNCE_MS = 600;
type ViewState = "indexing" | "ready" | "empty" | "error";

/**
 * The **3D** mode of the Graph surface (#280 S1) — an interactive 3D force-directed graph of the
 * `KnowledgeModel`: orbit/zoom, hover for a label, click a node to open its note. Read-only; the graph
 * is a thin shell over the pure {@link build3DGraph} projection. The `3d-force-graph` library (three.js)
 * is imported lazily on first render and torn down on close, so it never sits in the startup path.
 */
export class Graph3DRenderer extends KnowledgeModeRenderer {
    private state: ViewState = "indexing";
    private data: Graph3DData = { nodes: [], links: [] };
    private graph: ForceGraph3DInstance | null = null;
    private wrapperEl: HTMLElement | null = null;
    private graphEl: HTMLElement | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private debounceTimer: number | undefined;
    private disposed = false;
    private readonly colorCache = new Map<string, string>();

    constructor(container: HTMLElement, private readonly app: App) {
        super(container);
    }

    onload(): void {
        this.registerVaultListeners();
        this.recompute();
    }

    onunload(): void {
        this.disposed = true;
        window.clearTimeout(this.debounceTimer);
        this.teardownGraph();
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
            this.data = build3DGraph(index.getModel());
            this.state = this.data.nodes.length === 0 ? "empty" : "ready";
            this.render();
        } catch (error) {
            log.error("[Graph3D] failed to compute the graph", error);
            this.state = "error";
            this.render();
        }
    }

    private render(): void {
        if (this.state === "ready") {
            // Feed new data into the live graph if it's already mounted; otherwise mount it.
            if (this.graph) {
                this.graph.graphData(this.data);
                this.renderLegend();
                return;
            }
            void this.mountGraph();
            return;
        }
        // Any non-ready state tears down the WebGL graph and shows a plain message.
        this.teardownGraph();
        this.container.empty();
        const messageKey =
            this.state === "indexing" ? "graph3d_state_indexing"
                : this.state === "empty" ? "graph3d_state_empty"
                    : "graph3d_state_error";
        this.container.createDiv({ cls: c("graph3d-message"), text: t(messageKey) });
    }

    /** Lazily import the WebGL library and mount the graph; degrades to an error message on failure. */
    private async mountGraph(): Promise<void> {
        try {
            const { default: ForceGraph3D } = await import("3d-force-graph");
            if (this.disposed || this.state !== "ready") return; // mode switched/closed while importing

            this.container.empty();
            this.wrapperEl = this.container.createDiv({ cls: c("graph3d") });
            this.graphEl = this.wrapperEl.createDiv({ cls: c("graph3d-canvas") });

            const graph = new ForceGraph3D(this.graphEl)
                .backgroundColor("rgba(0,0,0,0)")
                .nodeLabel("name")
                .nodeVal("val")
                .nodeOpacity(0.9)
                .nodeAutoColorBy("group") // color nodes by their cluster (#280 S2)
                .linkColor((link) => this.relationColor((link as { type?: string }).type))
                .linkOpacity(0.4)
                .linkWidth(0.8)
                .linkDirectionalArrowLength(3.5)
                .linkDirectionalArrowRelPos(1)
                .onNodeClick((node) => {
                    const id = (node as { id?: string | number }).id;
                    if (typeof id === "string") void this.app.workspace.openLinkText(id, "", false);
                });
            graph.graphData(this.data);
            this.graph = graph;
            this.applySize();
            this.renderLegend();

            this.resizeObserver = new ResizeObserver(() => this.applySize());
            this.resizeObserver.observe(this.container);
        } catch (error) {
            log.error("[Graph3D] could not initialize the 3D graph (WebGL unavailable?)", error);
            if (this.disposed) return;
            this.container.empty();
            this.container.createDiv({ cls: c("graph3d-message"), text: t("graph3d_state_error") });
        }
    }

    private applySize(): void {
        if (!this.graph) return;
        const width = this.container.clientWidth || 400;
        const height = this.container.clientHeight || 400;
        this.graph.width(width).height(height);
    }

    /** Resolve a relation type to a concrete color, reading Obsidian's palette var (cached). */
    private relationColor(type: string | undefined): string {
        const key = type && RELATION_COLOR_VARS[type] ? type : "link";
        const cached = this.colorCache.get(key);
        if (cached) return cached;
        const value = getComputedStyle(document.body).getPropertyValue(RELATION_COLOR_VARS[key]).trim() || "#888888";
        this.colorCache.set(key, value);
        return value;
    }

    private relationLabel(type: string): string {
        if (type === "link") return t("graph3d_relation_link");
        return t(("relation_type_" + type.replace(/-/g, "_")) as Parameters<typeof t>[0]);
    }

    /** Render (or refresh) the relation-type legend for the types present in the current graph (#280 S2). */
    private renderLegend(): void {
        if (!this.wrapperEl) return;
        this.wrapperEl.querySelector("." + c("graph3d-legend"))?.remove();
        const types = [...new Set(this.data.links.map((link) => link.type))]
            .filter((type) => RELATION_COLOR_VARS[type])
            .sort();
        if (types.length === 0) return;

        const legend = this.wrapperEl.createDiv({ cls: c("graph3d-legend") });
        legend.createEl("div", { cls: c("graph3d-legend-title"), text: t("graph3d_legend_title") });
        for (const type of types) {
            const row = legend.createDiv({ cls: c("graph3d-legend-row") });
            row.createSpan({ cls: c("graph3d-swatch", "graph3d-swatch--" + type) });
            row.createSpan({ text: this.relationLabel(type) });
        }
    }

    private teardownGraph(): void {
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        if (this.graph) {
            try {
                this.graph._destructor();
            } catch (error) {
                log.warn("[Graph3D] error tearing down the graph", error);
            }
            this.graph = null;
        }
        this.graphEl = null;
        this.wrapperEl = null;
    }
}
