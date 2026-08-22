import { App, Platform } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import { activateSurface } from "architecture/plugin";
import {
    build3DGraph,
    buildAdjacency,
    capGraph3D,
    DEFAULT_STATE_COLOR_VAR,
    filterGraph3D,
    graph3dStats,
    Graph3DData,
    Graph3DFilter,
    Graph3DNode,
    OverlayKind,
    OVERLAY_KINDS,
    OVERLAY_SPECS,
    RELATION_COLOR_VARS,
    STATE_COLOR_VARS,
} from "architecture/knowledge/state";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import { consumeGraph3DFocus } from "./graph3dFocus";
// Type-only import — erased at compile time, so the heavy WebGL library is pulled in *lazily* via the
// dynamic import() in mountGraph(), never at plugin load (#280 S1, FR-4).
import type { ForceGraph3DInstance } from "3d-force-graph";

const DEBOUNCE_MS = 600;
const DIM_NODE = "rgba(125, 128, 138, 0.10)";
const DIM_LINK = "rgba(125, 128, 138, 0.04)";
type ViewState = "indexing" | "ready" | "empty" | "error";
type ColorMode = "state" | "cluster";
type LiveNode = { id?: string; x?: number; y?: number; z?: number };
type LiveLink = { source: string | LiveNode; target: string | LiveNode; type?: string };

const linkEndId = (end: string | LiveNode): string => (typeof end === "object" ? end.id ?? "" : end);

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
 * The **3D** mode of the Graph surface (#280) — an immersive, force-directed knowledge graph. What sets
 * it apart from a plain link graph: nodes coloured by **maturity** (knowledge state) or cluster, links
 * coloured by **relation type** with flowing particles, glow (bloom), **hover-to-focus a neighbourhood**,
 * and a **discovery lens** (orphans / dead-ends / contradictions with live counts). Read-only: click a
 * node to open it. The `3d-force-graph` library is imported lazily and torn down on close.
 */
export class Graph3DRenderer extends KnowledgeModeRenderer {
    private state: ViewState = "indexing";
    private data: Graph3DData = { nodes: [], links: [] };
    private displayed: Graph3DData = { nodes: [], links: [] };
    private adjacency = new Map<string, Set<string>>();
    private capped = false;
    private filter: Graph3DFilter = {};
    private colorMode: ColorMode = "state";
    private overlay: OverlayKind | null = null;
    private hoverNodes: Set<string> | null = null;
    private graph: ForceGraph3DInstance | null = null;
    private wrapperEl: HTMLElement | null = null;
    private graphEl: HTMLElement | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private debounceTimer: number | undefined;
    private disposed = false;
    private pendingFocusPath: string | null = null;
    private readonly colorCache = new Map<string, string>();
    private readonly colorButtons = new Map<ColorMode, HTMLElement>();
    private readonly lensChips = new Map<OverlayKind, HTMLElement>();
    private zoomSlider: HTMLInputElement | null = null;

    constructor(container: HTMLElement, private readonly app: App) {
        super(container);
    }

    onload(): void {
        this.pendingFocusPath = consumeGraph3DFocus();
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
            this.adjacency = buildAdjacency(this.data);
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
            if (this.disposed || this.state !== "ready") return;

            this.container.empty();
            this.wrapperEl = this.container.createDiv({ cls: c("graph3d") });
            this.buildToolbar(this.wrapperEl);
            this.graphEl = this.wrapperEl.createDiv({ cls: c("graph3d-canvas") });

            const graph = new ForceGraph3D(this.graphEl)
                .backgroundColor("#0b0e14") // fixed dark "space" so colours + particles pop (immersive)
                .nodeLabel("name")
                .nodeVal("val")
                .nodeOpacity(0.92)
                .nodeColor((node) => this.computeNodeColor(node as Graph3DNode & LiveNode))
                .linkColor((link) => this.computeLinkColor(link as LiveLink))
                .linkWidth((link) => this.computeLinkWidth(link as LiveLink))
                .linkOpacity(0.5)
                .linkDirectionalArrowLength(3)
                .linkDirectionalArrowRelPos(1)
                .linkDirectionalParticles(2)
                .linkDirectionalParticleWidth(1.4)
                .linkDirectionalParticleSpeed(0.006)
                .onNodeHover((node) => this.onHover((node as LiveNode | null)?.id ?? null))
                .onNodeClick((node) => {
                    const id = (node as LiveNode).id;
                    if (typeof id === "string") void this.app.workspace.openLinkText(id, "", false);
                })
                .onBackgroundClick(() => this.clearFocus())
                .onEngineStop(() => this.flyToPendingFocus());
            this.graph = graph;
            this.buildZoomControls(this.wrapperEl);
            this.applyGraphData();
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

    // ── Toolbar ────────────────────────────────────────────────────────────────
    private buildToolbar(parent: HTMLElement): void {
        const toolbar = parent.createDiv({ cls: c("graph3d-toolbar") });

        const search = toolbar.createEl("input", { cls: c("graph3d-search"), type: "search" });
        search.placeholder = t("graph3d_search_placeholder");
        search.setAttribute("aria-label", t("graph3d_search_placeholder"));
        this.registerDomEvent(search, "input", () => this.focusByName(search.value));

        // Color-by: a segmented toggle — Maturity (knowledge state) vs Cluster.
        const colorGroup = toolbar.createDiv({ cls: c("graph3d-segmented") });
        this.addColorButton(colorGroup, "state", t("graph3d_color_state"));
        this.addColorButton(colorGroup, "cluster", t("graph3d_color_cluster"));

        // Discovery lens: toggle chips with live counts.
        const stats = graph3dStats(this.data);
        const counts: Record<OverlayKind, number> = {
            "orphans": stats.orphans,
            "dead-ends": stats.deadEnds,
            "contradictions": stats.contradictions,
        };
        for (const kind of OVERLAY_KINDS) this.addLensChip(toolbar, kind, counts[kind]);

        const fit = toolbar.createEl("button", { cls: c("graph3d-fit"), text: t("graph3d_fit_view") });
        fit.setAttribute("aria-label", t("graph3d_fit_view"));
        this.registerDomEvent(fit, "click", () => this.graph?.zoomToFit(500, 20));
    }

    private addColorButton(group: HTMLElement, mode: ColorMode, label: string): void {
        const key = mode === "state" ? "graph3d_color_state" : "graph3d_color_cluster";
        const btn = group.createEl("button", { cls: c("graph3d-seg-btn"), text: label });
        btn.setAttribute("aria-label", t(key));
        btn.toggleClass(c("graph3d-seg-btn--active"), this.colorMode === mode);
        this.colorButtons.set(mode, btn);
        this.registerDomEvent(btn, "click", () => {
            this.colorMode = mode;
            for (const [m, el] of this.colorButtons) el.toggleClass(c("graph3d-seg-btn--active"), m === mode);
            this.refreshPaint();
        });
    }

    private addLensChip(toolbar: HTMLElement, kind: OverlayKind, count: number): void {
        const label = `${t(OVERLAY_SPECS[kind].labelKey as Parameters<typeof t>[0])} (${count})`;
        const chip = toolbar.createEl("button", { cls: c("graph3d-chip"), text: label });
        chip.setAttribute("aria-label", label);
        if (count === 0) chip.setAttribute("disabled", "true");
        this.lensChips.set(kind, chip);
        this.registerDomEvent(chip, "click", () => this.toggleOverlay(kind));
    }

    private toggleOverlay(kind: OverlayKind): void {
        this.overlay = this.overlay === kind ? null : kind;
        for (const [k, el] of this.lensChips) el.toggleClass(c("graph3d-chip--active"), k === this.overlay);
        this.refreshPaint();
    }

    // ── Zoom controls (buttons + draggable slider) ──────────────────────────────
    private buildZoomControls(parent: HTMLElement): void {
        const panel = parent.createDiv({ cls: c("graph3d-zoom") });

        const zoomIn = panel.createEl("button", { cls: c("graph3d-zoom-btn"), text: "+" });
        zoomIn.setAttribute("aria-label", t("graph3d_zoom_in"));
        this.registerDomEvent(zoomIn, "click", () => this.nudgeZoom(10));

        const slider = panel.createEl("input", { cls: c("graph3d-zoom-slider"), type: "range" });
        slider.min = "1";
        slider.max = "100";
        slider.value = "50";
        slider.setAttribute("aria-label", t("graph3d_zoom_label"));
        this.zoomSlider = slider;
        this.registerDomEvent(slider, "input", () => this.applyZoomFromSlider());

        const zoomOut = panel.createEl("button", { cls: c("graph3d-zoom-btn"), text: "−" });
        zoomOut.setAttribute("aria-label", t("graph3d_zoom_out"));
        this.registerDomEvent(zoomOut, "click", () => this.nudgeZoom(-10));
    }

    private nudgeZoom(delta: number): void {
        if (!this.zoomSlider) return;
        this.zoomSlider.value = String(Math.max(1, Math.min(100, Number(this.zoomSlider.value) + delta)));
        this.applyZoomFromSlider();
    }

    /** Map the slider (higher = closer) to a camera distance from the centre and fly there. */
    private applyZoomFromSlider(): void {
        if (!this.graph || !this.zoomSlider) return;
        const MIN = 60, MAX = 1400;
        const distance = MAX - (Number(this.zoomSlider.value) / 100) * (MAX - MIN);
        const cam = this.graph.cameraPosition();
        const current = Math.hypot(cam.x, cam.y, cam.z) || 1;
        const factor = distance / current;
        this.graph.cameraPosition({ x: cam.x * factor, y: cam.y * factor, z: cam.z * factor }, undefined, 150);
    }

    // ── Focus / hover ────────────────────────────────────────────────────────────
    private onHover(id: string | null): void {
        if (!id) {
            if (!this.hoverNodes) return;
            this.hoverNodes = null;
        } else {
            this.hoverNodes = new Set<string>([id, ...(this.adjacency.get(id) ?? [])]);
        }
        this.refreshPaint();
    }

    private clearFocus(): void {
        this.hoverNodes = null;
        this.overlay = null;
        for (const el of this.lensChips.values()) el.removeClass(c("graph3d-chip--active"));
        this.refreshPaint();
    }

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

    private focusNode(path: string): void {
        if (!this.graph) return;
        const nodes = (this.graph.graphData() as { nodes: LiveNode[] }).nodes;
        const node = nodes.find((n) => n.id === path);
        if (!node || node.x === undefined) return;
        const x = node.x, y = node.y ?? 0, z = node.z ?? 0;
        const ratio = 1 + 120 / (Math.hypot(x, y, z) || 1);
        this.graph.cameraPosition({ x: x * ratio, y: y * ratio, z: z * ratio }, { x, y, z }, 1200);
    }

    /** Re-evaluate the paint accessors (colour depends on mode / overlay / hover state). */
    private refreshPaint(): void {
        if (!this.graph) return;
        this.graph
            .nodeColor((node) => this.computeNodeColor(node as Graph3DNode & LiveNode))
            .linkColor((link) => this.computeLinkColor(link as LiveLink))
            .linkWidth((link) => this.computeLinkWidth(link as LiveLink));
    }

    // ── Paint ─────────────────────────────────────────────────────────────────
    private computeNodeColor(node: Graph3DNode & LiveNode): string {
        if (this.overlay) {
            return OVERLAY_SPECS[this.overlay].matches(node) ? this.varColor(OVERLAY_SPECS[this.overlay].colorVar) : DIM_NODE;
        }
        if (this.hoverNodes && !this.hoverNodes.has(node.id ?? "")) return DIM_NODE;
        return this.baseNodeColor(node);
    }

    private baseNodeColor(node: Graph3DNode): string {
        if (this.colorMode === "state") return this.varColor(STATE_COLOR_VARS[node.state] ?? DEFAULT_STATE_COLOR_VAR);
        return node.group < 0 ? "#8a8f98" : `hsl(${(node.group * 67) % 360}, 65%, 62%)`;
    }

    private computeLinkColor(link: LiveLink): string {
        if (this.overlay) return DIM_LINK;
        if (this.hoverNodes) {
            const lit = this.hoverNodes.has(linkEndId(link.source)) && this.hoverNodes.has(linkEndId(link.target));
            return lit ? this.relationColor(link.type) : DIM_LINK;
        }
        return this.relationColor(link.type);
    }

    private computeLinkWidth(link: LiveLink): number {
        if (!this.hoverNodes) return 0.8;
        const lit = this.hoverNodes.has(linkEndId(link.source)) && this.hoverNodes.has(linkEndId(link.target));
        return lit ? 2.5 : 0.4;
    }

    /** Resolve a CSS palette var to a concrete colour (cached). */
    private varColor(varName: string): string {
        const cached = this.colorCache.get(varName);
        if (cached) return cached;
        const value = getComputedStyle(document.body).getPropertyValue(varName).trim() || "#888888";
        this.colorCache.set(varName, value);
        return value;
    }

    private relationColor(type: string | undefined): string {
        const key = type && RELATION_COLOR_VARS[type] ? type : "link";
        return this.varColor(RELATION_COLOR_VARS[key]);
    }

    private relationLabel(type: string): string {
        if (type === "link") return t("graph3d_relation_link");
        return t(("relation_type_" + type.replace(/-/g, "_")) as Parameters<typeof t>[0]);
    }

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

    private renderCappedHint(): void {
        if (!this.wrapperEl) return;
        this.wrapperEl.querySelector("." + c("graph3d-hint"))?.remove();
        if (this.capped) this.wrapperEl.createDiv({ cls: c("graph3d-hint"), text: t("graph3d_capped_hint") });
    }

    private renderFallback(): void {
        this.teardownGraph();
        this.container.empty();
        const panel = this.container.createDiv({ cls: c("graph3d-message") });
        panel.createEl("p", { text: t("graph3d_fallback_message") });
        const btn = panel.createEl("button", { text: t("graph3d_fallback_open_map"), cls: "mod-cta" });
        this.registerDomEvent(btn, "click", () => void activateSurface(this.app, "zettelflow-graph", "map"));
    }

    private applySize(): void {
        if (!this.graph) return;
        this.graph.width(this.container.clientWidth || 400).height(this.container.clientHeight || 400);
    }

    private teardownGraph(): void {
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.colorButtons.clear();
        this.lensChips.clear();
        this.zoomSlider = null;
        this.hoverNodes = null;
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
