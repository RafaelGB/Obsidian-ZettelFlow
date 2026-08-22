import { App, Platform } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import { activateSurface } from "architecture/plugin";
import {
    build3DGraph,
    capGraph3D,
    filterGraph3D,
    Graph3DData,
    Graph3DFilter,
    Graph3DNode,
    OverlayKind,
    OVERLAY_KINDS,
    OVERLAY_SPECS,
    RELATION_COLOR_VARS,
} from "architecture/knowledge/state";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import { consumeGraph3DFocus } from "./graph3dFocus";
// Type-only import — erased at compile time, so the heavy WebGL library is pulled in *lazily* via the
// dynamic import() in mountGraph(), never at plugin load (#280 S1, FR-4).
import type { ForceGraph3DInstance } from "3d-force-graph";

const DEBOUNCE_MS = 600;
type ViewState = "indexing" | "ready" | "empty" | "error";
type LiveNode = { id?: string; x?: number; y?: number; z?: number };

/** True when the runtime can render WebGL (desktop with a working context). */
function webglAvailable(): boolean {
    try {
        const canvas = document.createElement("canvas");
        return !!(window.WebGLRenderingContext && (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")));
    } catch {
        return false;
    }
}

/**
 * The **3D** mode of the Graph surface (#280) — an interactive 3D force-directed graph of the
 * `KnowledgeModel`: orbit/zoom, hover for a label, click a node to open its note; nodes coloured by
 * cluster and links by relation type (S2); a toolbar to search-to-focus and filter by state (S3). The
 * `3d-force-graph` library (three.js) is imported lazily on first render and torn down on close.
 */
export class Graph3DRenderer extends KnowledgeModeRenderer {
    private state: ViewState = "indexing";
    private data: Graph3DData = { nodes: [], links: [] };
    private displayed: Graph3DData = { nodes: [], links: [] };
    private capped = false;
    private filter: Graph3DFilter = {};
    private overlay: OverlayKind | null = null;
    private graph: ForceGraph3DInstance | null = null;
    private wrapperEl: HTMLElement | null = null;
    private graphEl: HTMLElement | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private debounceTimer: number | undefined;
    private disposed = false;
    private pendingFocusPath: string | null = null;
    private readonly colorCache = new Map<string, string>();

    constructor(container: HTMLElement, private readonly app: App) {
        super(container);
    }

    onload(): void {
        this.pendingFocusPath = consumeGraph3DFocus(); // a deep-link may have asked us to fly to a note
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
            const full = build3DGraph(index.getModel());
            this.data = capGraph3D(full); // level-of-detail for large vaults (#280 S5)
            this.capped = this.data.nodes.length < full.nodes.length;
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
            if (!Platform.isMobile && webglAvailable()) {
                if (this.graph) this.applyGraphData();
                else void this.mountGraph();
            } else {
                this.renderFallback(); // mobile / no WebGL → point to the 2D Map (#280 S5)
            }
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
            this.buildToolbar(this.wrapperEl);
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
                    const id = (node as LiveNode).id;
                    if (typeof id === "string") void this.app.workspace.openLinkText(id, "", false);
                })
                .onEngineStop(() => this.flyToPendingFocus());
            this.graph = graph;
            this.applyGraphData();
            this.applyOverlay();
            this.applySize();

            this.resizeObserver = new ResizeObserver(() => this.applySize());
            this.resizeObserver.observe(this.container);
        } catch (error) {
            log.error("[Graph3D] could not initialize the 3D graph (WebGL unavailable?)", error);
            if (this.disposed) return;
            this.container.empty();
            this.container.createDiv({ cls: c("graph3d-message"), text: t("graph3d_state_error") });
        }
    }

    /** Push the current (filtered) data into the live graph and refresh the legend + capped hint. */
    private applyGraphData(): void {
        if (!this.graph) return;
        this.displayed = filterGraph3D(this.data, this.filter);
        this.graph.graphData(this.displayed);
        this.renderLegend();
        this.renderCappedHint();
    }

    /** Mobile / no-WebGL fallback (#280 S5): a message + a button to open the 2D Map mode instead. */
    private renderFallback(): void {
        this.teardownGraph();
        this.container.empty();
        const panel = this.container.createDiv({ cls: c("graph3d-message") });
        panel.createEl("p", { text: t("graph3d_fallback_message") });
        const btn = panel.createEl("button", { text: t("graph3d_fallback_open_map"), cls: "mod-cta" });
        this.registerDomEvent(btn, "click", () => void activateSurface(this.app, "zettelflow-graph", "map"));
    }

    /** When the graph was capped for performance, note that only the most-connected notes are shown. */
    private renderCappedHint(): void {
        if (!this.wrapperEl) return;
        this.wrapperEl.querySelector("." + c("graph3d-hint"))?.remove();
        if (this.capped) this.wrapperEl.createDiv({ cls: c("graph3d-hint"), text: t("graph3d_capped_hint") });
    }

    // ── Toolbar (S3): search-to-focus + filter by state ────────────────────────
    private buildToolbar(parent: HTMLElement): void {
        const toolbar = parent.createDiv({ cls: c("graph3d-toolbar") });

        const search = toolbar.createEl("input", { cls: c("graph3d-search"), type: "search" });
        search.placeholder = t("graph3d_search_placeholder");
        search.setAttribute("aria-label", t("graph3d_search_placeholder"));
        this.registerDomEvent(search, "input", () => this.focusByName(search.value));

        const select = toolbar.createEl("select", { cls: c("graph3d-state-filter") });
        select.setAttribute("aria-label", t("graph3d_filter_all_states"));
        select.createEl("option", { text: t("graph3d_filter_all_states"), value: "" });
        for (const state of this.uniqueStates()) select.createEl("option", { text: state, value: state });
        this.registerDomEvent(select, "change", () => {
            this.filter = { ...this.filter, state: select.value };
            this.applyGraphData();
        });

        // Discovery lens (#280 S4): highlight an actionable class of note in space.
        const overlay = toolbar.createEl("select", { cls: c("graph3d-overlay-filter") });
        overlay.setAttribute("aria-label", t("graph3d_overlay_none"));
        overlay.createEl("option", { text: t("graph3d_overlay_none"), value: "" });
        for (const kind of OVERLAY_KINDS) {
            overlay.createEl("option", { text: t(OVERLAY_SPECS[kind].labelKey as Parameters<typeof t>[0]), value: kind });
        }
        this.registerDomEvent(overlay, "change", () => {
            this.overlay = (overlay.value || null) as OverlayKind | null;
            this.applyOverlay();
        });

        // Camera preset (#280 S6): re-frame the whole graph.
        const fit = toolbar.createEl("button", { cls: c("graph3d-fit"), text: t("graph3d_fit_view") });
        fit.setAttribute("aria-label", t("graph3d_fit_view"));
        this.registerDomEvent(fit, "click", () => this.graph?.zoomToFit(500, 20));
    }

    /** Apply the active discovery-lens overlay: highlight matching nodes, dim the rest; none ⇒ cluster color. */
    private applyOverlay(): void {
        if (!this.graph) return;
        if (!this.overlay) {
            this.graph.nodeAutoColorBy("group").linkOpacity(0.4);
            return;
        }
        const spec = OVERLAY_SPECS[this.overlay];
        const highlight = getComputedStyle(document.body).getPropertyValue(spec.colorVar).trim() || "#e0a030";
        const dim = "rgba(136, 136, 136, 0.15)";
        this.graph.nodeColor((node) => (spec.matches(node as unknown as Graph3DNode) ? highlight : dim)).linkOpacity(0.1);
    }

    private uniqueStates(): string[] {
        return [...new Set(this.data.nodes.map((node) => node.state).filter((s) => s))].sort();
    }

    /** Fly the camera to the first displayed node whose name matches the query (no filtering). */
    private focusByName(query: string): void {
        const q = query.trim().toLowerCase();
        if (!q) return;
        const match = this.displayed.nodes.find((node) => node.name.toLowerCase().includes(q));
        if (match) this.focusNode(match.id);
    }

    private flyToPendingFocus(): void {
        if (!this.pendingFocusPath) return;
        const path = this.pendingFocusPath;
        this.pendingFocusPath = null;
        this.focusNode(path);
    }

    /** Move the camera to orbit a node by its path (id), if it's in the live graph with coordinates. */
    private focusNode(path: string): void {
        if (!this.graph) return;
        const nodes = (this.graph.graphData() as { nodes: LiveNode[] }).nodes;
        const node = nodes.find((n) => n.id === path);
        if (!node || node.x === undefined) return;
        const x = node.x, y = node.y ?? 0, z = node.z ?? 0;
        const distance = 120;
        const ratio = 1 + distance / (Math.hypot(x, y, z) || 1);
        this.graph.cameraPosition({ x: x * ratio, y: y * ratio, z: z * ratio }, { x, y, z }, 1200);
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

    /** Render (or refresh) the relation-type legend for the types present in the displayed graph. */
    private renderLegend(): void {
        if (!this.wrapperEl) return;
        this.wrapperEl.querySelector("." + c("graph3d-legend"))?.remove();
        const types = [...new Set(this.displayed.links.map((link) => link.type))]
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
