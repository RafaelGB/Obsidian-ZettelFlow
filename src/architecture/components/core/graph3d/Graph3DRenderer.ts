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
    graph3dSignature,
    graph3dStats,
    graph3dTimeRange,
    graph3dUpToTime,
    Graph3DData,
    Graph3DNode,
    OverlayKind,
    OVERLAY_KINDS,
    OVERLAY_SPECS,
    RELATION_COLOR_VARS,
    STATE_COLOR_VARS,
} from "architecture/knowledge/state";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import { consumeGraph3DFocus } from "./graph3dFocus";
// Type-only import — erased at compile time, so the WebGL library loads lazily in mountGraph().
import type { ForceGraph3DInstance } from "3d-force-graph";

const DEBOUNCE_MS = 700;
const DIM_NODE = "rgba(120, 124, 135, 0.10)";
const DIM_LINK = "rgba(120, 124, 135, 0.04)";
const TIMELAPSE_MS = 9000;
const TIMELAPSE_STEPS = 48;
type ViewState = "indexing" | "ready" | "empty" | "error";
type ColorMode = "state" | "cluster";
type LiveNode = { id?: string; x?: number; y?: number; z?: number; vx?: number; vy?: number; vz?: number };
type LiveLink = { source: string | LiveNode; target: string | LiveNode; type?: string };
const endId = (end: string | LiveNode): string => (typeof end === "object" ? end.id ?? "" : end);

function webglAvailable(): boolean {
    try {
        const canvas = document.createElement("canvas");
        return !!(window.WebGLRenderingContext && (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")));
    } catch {
        return false;
    }
}

/**
 * The **3D** mode of the Graph surface (#280) — an immersive knowledge graph that earns opening over
 * the native graph: nodes coloured by **maturity** (knowledge state) or cluster, links by relation type
 * with flowing particles; **hover to preview** and **click to pin** a neighbourhood; a **discovery lens**
 * (orphans/dead-ends/contradictions with counts); a **time-lapse** of how your thinking grew; and a
 * persistent status line so you always know what you're looking at. Updates **incrementally** (surviving
 * nodes keep their positions) so indexing never resets the layout. Read-only; double-click opens a note.
 */
export class Graph3DRenderer extends KnowledgeModeRenderer {
    private state: ViewState = "indexing";
    private data: Graph3DData = { nodes: [], links: [] };
    private displayed: Graph3DData = { nodes: [], links: [] };
    private adjacency = new Map<string, Set<string>>();
    private dataSignature = "";
    private capped = false;
    private colorMode: ColorMode = "state";
    private overlay: OverlayKind | null = null;
    private hoverId: string | null = null;
    private pinnedId: string | null = null;
    private timeCursor: number | null = null;
    private timelapseTimer: number | undefined;
    private lastClick = { id: "", at: 0 };
    private graph: ForceGraph3DInstance | null = null;
    private wrapperEl: HTMLElement | null = null;
    private graphEl: HTMLElement | null = null;
    private statusEl: HTMLElement | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private debounceTimer: number | undefined;
    private disposed = false;
    private pendingFocusPath: string | null = null;
    private readonly colorCache = new Map<string, string>();
    private readonly colorButtons = new Map<ColorMode, HTMLElement>();
    private readonly lensChips = new Map<OverlayKind, HTMLElement>();
    private zoomSlider: HTMLInputElement | null = null;
    private timeSlider: HTMLInputElement | null = null;
    private playBtn: HTMLElement | null = null;

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
        window.clearInterval(this.timelapseTimer);
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
            const next = capGraph3D(full);
            const signature = graph3dSignature(next);
            // Skip when the shape is unchanged (indexing "resolved" fires repeatedly) — no needless reflow.
            if (this.graph && this.state === "ready" && signature === this.dataSignature) return;
            this.dataSignature = signature;
            this.data = next;
            this.capped = next.nodes.length < full.nodes.length;
            this.adjacency = buildAdjacency(next);
            this.state = next.nodes.length === 0 ? "empty" : "ready";
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
                this.renderFallback();
            }
            return;
        }
        this.teardownGraph();
        this.container.empty();
        const key = this.state === "indexing" ? "graph3d_state_indexing" : this.state === "empty" ? "graph3d_state_empty" : "graph3d_state_error";
        this.container.createDiv({ cls: c("graph3d-message"), text: t(key) });
    }

    /** Lazily import the WebGL library and mount the graph; degrades to an error message on failure. */
    private async mountGraph(): Promise<void> {
        try {
            const { default: ForceGraph3D } = await import("3d-force-graph");
            if (this.disposed || this.state !== "ready") return;

            this.container.empty();
            this.wrapperEl = this.container.createDiv({ cls: c("graph3d") });
            this.buildTopBar(this.wrapperEl);
            this.graphEl = this.wrapperEl.createDiv({ cls: c("graph3d-canvas") });
            this.buildBottomBar(this.wrapperEl);

            const graph = new ForceGraph3D(this.graphEl)
                .backgroundColor("#0b0e14")
                .nodeLabel("name")
                .nodeVal("val")
                .nodeRelSize(4)
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
                .onNodeClick((node) => this.onClick((node as LiveNode).id))
                .onBackgroundClick(() => this.clearFocus())
                .onEngineStop(() => this.flyToPendingFocus());
            this.graph = graph;
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

    /** The base data for the current time cursor (whole graph, or up to the time-lapse cursor). */
    private baseData(): Graph3DData {
        return this.timeCursor === null ? this.data : graph3dUpToTime(this.data, this.timeCursor);
    }

    /** Push the current data into the live graph — preserving survivors' positions so it never resets. */
    private applyGraphData(): void {
        if (!this.graph) return;
        this.displayed = filterGraph3D(this.baseData(), {});
        this.preservePositions(this.displayed);
        this.graph.graphData(this.displayed);
        this.renderLegend();
        this.updateStatus();
    }

    /** Seed surviving nodes at their current live coordinates so an update adds/removes without reflow. */
    private preservePositions(next: Graph3DData): void {
        if (!this.graph) return;
        const live = (this.graph.graphData() as { nodes: LiveNode[] }).nodes;
        const byId = new Map<string, LiveNode>();
        for (const node of live) if (node.id) byId.set(node.id, node);
        for (const node of next.nodes as unknown as LiveNode[]) {
            const prev = node.id ? byId.get(node.id) : undefined;
            if (prev && prev.x !== undefined) {
                node.x = prev.x; node.y = prev.y; node.z = prev.z;
                node.vx = prev.vx; node.vy = prev.vy; node.vz = prev.vz;
            }
        }
    }

    // ── Top bar: search · color · lens · fit · status ───────────────────────────
    private buildTopBar(parent: HTMLElement): void {
        const bar = parent.createDiv({ cls: c("graph3d-topbar") });
        const controls = bar.createDiv({ cls: c("graph3d-controls") });

        const search = controls.createEl("input", { cls: c("graph3d-search"), type: "search" });
        search.placeholder = t("graph3d_search_placeholder");
        search.setAttribute("aria-label", t("graph3d_search_placeholder"));
        this.registerDomEvent(search, "input", () => this.focusByName(search.value));

        const colorGroup = controls.createDiv({ cls: c("graph3d-group") });
        colorGroup.createSpan({ cls: c("graph3d-group-label"), text: t("graph3d_group_color") });
        const segmented = colorGroup.createDiv({ cls: c("graph3d-segmented") });
        this.addColorButton(segmented, "state", t("graph3d_color_state"));
        this.addColorButton(segmented, "cluster", t("graph3d_color_cluster"));

        const lensGroup = controls.createDiv({ cls: c("graph3d-group") });
        lensGroup.createSpan({ cls: c("graph3d-group-label"), text: t("graph3d_group_lens") });
        const stats = graph3dStats(this.data);
        const counts: Record<OverlayKind, number> = { "orphans": stats.orphans, "dead-ends": stats.deadEnds, "contradictions": stats.contradictions };
        for (const kind of OVERLAY_KINDS) this.addLensChip(lensGroup, kind, counts[kind]);

        const fit = controls.createEl("button", { cls: c("graph3d-fit"), text: t("graph3d_fit_view") });
        fit.setAttribute("aria-label", t("graph3d_fit_view"));
        this.registerDomEvent(fit, "click", () => this.graph?.zoomToFit(500, 24));

        this.statusEl = bar.createDiv({ cls: c("graph3d-status") });
    }

    private addColorButton(group: HTMLElement, mode: ColorMode, label: string): void {
        const btn = group.createEl("button", { cls: c("graph3d-seg-btn"), text: label });
        btn.toggleClass(c("graph3d-seg-btn--active"), this.colorMode === mode);
        btn.setAttribute("aria-pressed", this.colorMode === mode ? "true" : "false");
        this.colorButtons.set(mode, btn);
        this.registerDomEvent(btn, "click", () => {
            this.colorMode = mode;
            for (const [m, el] of this.colorButtons) {
                el.toggleClass(c("graph3d-seg-btn--active"), m === mode);
                el.setAttribute("aria-pressed", m === mode ? "true" : "false");
            }
            this.refreshPaint();
            this.renderLegend();
            this.updateStatus();
        });
    }

    private addLensChip(group: HTMLElement, kind: OverlayKind, count: number): void {
        const label = `${t(OVERLAY_SPECS[kind].labelKey as Parameters<typeof t>[0])} (${count})`;
        const chip = group.createEl("button", { cls: c("graph3d-chip"), text: label });
        chip.setAttribute("aria-label", label);
        chip.setAttribute("aria-pressed", "false");
        if (count === 0) chip.setAttribute("disabled", "true");
        this.lensChips.set(kind, chip);
        this.registerDomEvent(chip, "click", () => this.toggleOverlay(kind));
    }

    private toggleOverlay(kind: OverlayKind): void {
        this.overlay = this.overlay === kind ? null : kind;
        for (const [k, el] of this.lensChips) {
            const active = k === this.overlay;
            el.toggleClass(c("graph3d-chip--active"), active);
            el.setAttribute("aria-pressed", active ? "true" : "false");
        }
        this.refreshPaint();
        this.updateStatus();
    }

    // ── Bottom bar: time-lapse (left/centre) + zoom (right) ─────────────────────
    private buildBottomBar(parent: HTMLElement): void {
        const bar = parent.createDiv({ cls: c("graph3d-bottombar") });

        const timelapse = bar.createDiv({ cls: c("graph3d-timelapse") });
        this.playBtn = timelapse.createEl("button", { cls: c("graph3d-play"), text: t("graph3d_timelapse_play") });
        this.registerDomEvent(this.playBtn, "click", () => this.toggleTimelapse());
        const time = timelapse.createEl("input", { cls: c("graph3d-time-slider"), type: "range" });
        time.min = "0"; time.max = "100"; time.value = "100";
        time.setAttribute("aria-label", t("graph3d_timelapse_play"));
        this.timeSlider = time;
        this.registerDomEvent(time, "input", () => this.scrubTime(Number(time.value)));

        const zoom = bar.createDiv({ cls: c("graph3d-zoom") });
        const zoomOut = zoom.createEl("button", { cls: c("graph3d-zoom-btn"), text: "−" });
        zoomOut.setAttribute("aria-label", t("graph3d_zoom_out"));
        this.registerDomEvent(zoomOut, "click", () => this.nudgeZoom(-12));
        const slider = zoom.createEl("input", { cls: c("graph3d-zoom-slider"), type: "range" });
        slider.min = "1"; slider.max = "100"; slider.value = "50";
        slider.setAttribute("aria-label", t("graph3d_zoom_label"));
        this.zoomSlider = slider;
        this.registerDomEvent(slider, "input", () => this.applyZoomFromSlider());
        const zoomIn = zoom.createEl("button", { cls: c("graph3d-zoom-btn"), text: "+" });
        zoomIn.setAttribute("aria-label", t("graph3d_zoom_in"));
        this.registerDomEvent(zoomIn, "click", () => this.nudgeZoom(12));
    }

    // ── Time-lapse ──────────────────────────────────────────────────────────────
    private scrubTime(value: number): void {
        const { min, max } = graph3dTimeRange(this.data);
        this.timeCursor = value >= 100 || max === 0 ? null : min + (value / 100) * (max - min);
        this.applyGraphData();
    }

    private toggleTimelapse(): void {
        if (this.timelapseTimer !== undefined) {
            this.stopTimelapse();
            return;
        }
        if (this.playBtn) this.playBtn.setText(t("graph3d_timelapse_pause"));
        let step = 0;
        this.timelapseTimer = window.setInterval(() => {
            step++;
            const value = Math.min(100, (step / TIMELAPSE_STEPS) * 100);
            if (this.timeSlider) this.timeSlider.value = String(value);
            this.scrubTime(value);
            if (value >= 100) this.stopTimelapse();
        }, TIMELAPSE_MS / TIMELAPSE_STEPS);
    }

    private stopTimelapse(): void {
        window.clearInterval(this.timelapseTimer);
        this.timelapseTimer = undefined;
        if (this.playBtn) this.playBtn.setText(t("graph3d_timelapse_play"));
    }

    // ── Zoom ────────────────────────────────────────────────────────────────────
    private nudgeZoom(delta: number): void {
        if (!this.zoomSlider) return;
        this.zoomSlider.value = String(Math.max(1, Math.min(100, Number(this.zoomSlider.value) + delta)));
        this.applyZoomFromSlider();
    }

    private applyZoomFromSlider(): void {
        if (!this.graph || !this.zoomSlider) return;
        const MIN = 60, MAX = 1400;
        const distance = MAX - (Number(this.zoomSlider.value) / 100) * (MAX - MIN);
        const cam = this.graph.cameraPosition();
        const current = Math.hypot(cam.x, cam.y, cam.z) || 1;
        const factor = distance / current;
        this.graph.cameraPosition({ x: cam.x * factor, y: cam.y * factor, z: cam.z * factor }, undefined, 150);
    }

    // ── Focus / hover / pin ──────────────────────────────────────────────────────
    private activeFocus(): Set<string> | null {
        const anchor = this.pinnedId ?? this.hoverId;
        if (!anchor) return null;
        return new Set<string>([anchor, ...(this.adjacency.get(anchor) ?? [])]);
    }

    private onHover(id: string | null): void {
        if (this.pinnedId) return; // pinned focus wins over hover
        this.hoverId = id;
        this.refreshPaint();
    }

    /** Single click pins a neighbourhood (and flies to it); a quick second click opens the note. */
    private onClick(id: string | undefined): void {
        if (typeof id !== "string") return;
        const now = Date.now();
        if (this.lastClick.id === id && now - this.lastClick.at < 350) {
            void this.app.workspace.openLinkText(id, "", false);
            this.lastClick = { id: "", at: 0 };
            return;
        }
        this.lastClick = { id, at: now };
        this.pinnedId = this.pinnedId === id ? null : id;
        this.hoverId = null;
        if (this.pinnedId) this.focusNode(this.pinnedId);
        this.refreshPaint();
        this.updateStatus();
    }

    private clearFocus(): void {
        this.hoverId = null;
        this.pinnedId = null;
        this.overlay = null;
        for (const el of this.lensChips.values()) {
            el.removeClass(c("graph3d-chip--active"));
            el.setAttribute("aria-pressed", "false");
        }
        this.refreshPaint();
        this.updateStatus();
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
        const focus = this.activeFocus();
        if (focus && !focus.has(node.id ?? "")) return DIM_NODE;
        return this.baseNodeColor(node);
    }

    private baseNodeColor(node: Graph3DNode): string {
        if (this.colorMode === "state") return this.varColor(STATE_COLOR_VARS[node.state] ?? DEFAULT_STATE_COLOR_VAR);
        return node.group < 0 ? "#8a8f98" : `hsl(${(node.group * 67) % 360}, 65%, 62%)`;
    }

    private computeLinkColor(link: LiveLink): string {
        if (this.overlay) return DIM_LINK;
        const focus = this.activeFocus();
        if (focus) return focus.has(endId(link.source)) && focus.has(endId(link.target)) ? this.relationColor(link.type) : DIM_LINK;
        return this.relationColor(link.type);
    }

    private computeLinkWidth(link: LiveLink): number {
        const focus = this.activeFocus();
        if (!focus) return 0.8;
        return focus.has(endId(link.source)) && focus.has(endId(link.target)) ? 2.5 : 0.4;
    }

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

    // ── Status + legend ──────────────────────────────────────────────────────────
    private updateStatus(): void {
        if (!this.statusEl) return;
        const colour = t(this.colorMode === "state" ? "graph3d_color_state" : "graph3d_color_cluster");
        const parts = [`${t("graph3d_group_color")}: ${colour}`, `${this.displayed.nodes.length} ${t("graph3d_status_notes")}`];
        if (this.overlay) parts.push(`${t("graph3d_group_lens")}: ${t(OVERLAY_SPECS[this.overlay].labelKey as Parameters<typeof t>[0])}`);
        if (this.pinnedId) {
            const pinned = this.displayed.nodes.find((n) => n.id === this.pinnedId);
            if (pinned) parts.push(`▸ ${pinned.name}`);
        }
        if (this.timeCursor !== null) parts.push(t("graph3d_status_timelapse"));
        if (this.capped) parts.push(t("graph3d_capped_hint"));
        this.statusEl.setText(parts.join("  ·  "));
    }

    private renderLegend(): void {
        if (!this.wrapperEl) return;
        this.wrapperEl.querySelector("." + c("graph3d-legend"))?.remove();
        const legend = this.wrapperEl.createDiv({ cls: c("graph3d-legend") });

        // Node colour legend — reflects the active mode so the user knows what colours mean.
        legend.createEl("div", { cls: c("graph3d-legend-title"), text: t("graph3d_legend_nodes") });
        if (this.colorMode === "state") {
            const states = [...new Set(this.displayed.nodes.map((n) => n.state).filter((s) => s))].sort();
            for (const stateName of states) {
                const row = legend.createDiv({ cls: c("graph3d-legend-row") });
                const known = STATE_COLOR_VARS[stateName] !== undefined;
                row.createSpan({ cls: known ? c("graph3d-swatch", "graph3d-swatch--state-" + stateName) : c("graph3d-swatch") });
                row.createSpan({ text: stateName });
            }
        } else {
            legend.createDiv({ cls: c("graph3d-legend-row") }).createSpan({ text: t("graph3d_legend_cluster") });
        }

        // Relation (link) legend for the types present.
        const types = [...new Set(this.displayed.links.map((l) => l.type))].filter((tp) => RELATION_COLOR_VARS[tp]).sort();
        if (types.length > 0) {
            legend.createEl("div", { cls: c("graph3d-legend-title"), text: t("graph3d_legend_title") });
            for (const type of types) {
                const row = legend.createDiv({ cls: c("graph3d-legend-row") });
                row.createSpan({ cls: c("graph3d-swatch", "graph3d-swatch--" + type) });
                row.createSpan({ text: this.relationLabel(type) });
            }
        }
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
        window.clearInterval(this.timelapseTimer);
        this.timelapseTimer = undefined;
        this.colorButtons.clear();
        this.lensChips.clear();
        this.zoomSlider = null;
        this.timeSlider = null;
        this.playBtn = null;
        this.statusEl = null;
        this.hoverId = null;
        this.pinnedId = null;
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
