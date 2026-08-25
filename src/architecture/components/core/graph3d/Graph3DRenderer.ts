import { App, Menu, Platform, setIcon } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import {
    build3DGraph,
    buildAdjacency,
    DEFAULT_STATE_COLOR,
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
    RELATION_COLORS,
    shortestPath,
    STATE_COLOR_VARS,
    STATE_COLORS,
} from "architecture/knowledge/state";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import { consumeGraph3DFocus } from "./graph3dFocus";
// Type-only imports — erased at compile time, so the WebGL libraries load lazily in mountGraph().
import type { ForceGraph3DInstance } from "3d-force-graph";
import type * as THREE from "three";

const DEBOUNCE_MS = 700;
const DIM_NODE = "rgba(120, 124, 135, 0.10)";
const DIM_LINK = "rgba(120, 124, 135, 0.04)";
const TIMELAPSE_MS = 9000;
const TIMELAPSE_STEPS = 48;
type ViewState = "indexing" | "ready" | "empty" | "error";
type ColorMode = "state" | "cluster";
type LiveNode = { id?: string; x?: number; y?: number; z?: number; vx?: number; vy?: number; vz?: number };
type LiveLink = { source: string | LiveNode; target: string | LiveNode; type?: string };
type LabelSprite = THREE.Sprite; // three-spritetext's SpriteText extends three's Sprite (an Object3D)
const endId = (end: string | LiveNode): string => (typeof end === "object" ? end.id ?? "" : end);
const HUB_LABEL_COUNT = 18;

function webglAvailable(): boolean {
    try {
        const canvas = createEl("canvas");
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
    private colorMode: ColorMode = "state";
    private overlay: OverlayKind | null = null;
    private hoverId: string | null = null;
    private pinnedId: string | null = null;
    private readonly hiddenRelations = new Set<string>();
    private readonly hiddenNodes = new Set<string>();
    private fullscreen = false;
    private fullscreenBtn: HTMLElement | null = null;
    private lite = false;
    private liteBtn: HTMLElement | null = null;
    private pathMode = false;
    private pathFrom: string | null = null;
    private pathNodes: Set<string> | null = null;
    private pathEdges: Set<string> | null = null;
    private pathBtn: HTMLElement | null = null;
    private timeCursor: number | null = null;
    private timelapseTimer: number | undefined;
    private lastClick = { id: "", at: 0 };
    private hubIds = new Set<string>();
    private hasFitted = false;
    private spread = 35;
    private three: typeof THREE | null = null;
    private glowTexture: THREE.CanvasTexture | null = null;
    private hullMeshes: THREE.Mesh[] = [];
    private spriteTextCtor: (new (t?: string, h?: number, c?: string) => LabelSprite) | null = null;
    private readonly proximityLabels = new Map<string, LabelSprite>();
    private proximityTimer: number | undefined;
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
            const next = build3DGraph(index.getModel()); // show every indexed note (no cap, #280 direction)
            const signature = graph3dSignature(next);
            // Skip when the shape is unchanged (indexing "resolved" fires repeatedly) — no needless reflow.
            if (this.graph && this.state === "ready" && signature === this.dataSignature) return;
            this.dataSignature = signature;
            this.data = next;
            this.adjacency = buildAdjacency(next);
            this.hubIds = new Set([...next.nodes].sort((a, b) => b.val - a.val).slice(0, HUB_LABEL_COUNT).map((n) => n.id));
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
            // Labels + glow/hull geometry — best-effort; a failure never blanks the graph (spheres remain).
            let SpriteText: (new (text?: string, textHeight?: number, color?: string) => LabelSprite) | null = null;
            try {
                SpriteText = (await import("three-spritetext")).default;
            } catch (error) {
                log.warn("[Graph3D] labels unavailable (three-spritetext)", error);
            }
            try {
                this.three = await import("three");
                this.glowTexture = this.makeGlowTexture(this.three);
            } catch (error) {
                log.warn("[Graph3D] glow/hulls unavailable (three)", error);
            }
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
                .nodeRelSize(5)
                .nodeResolution(8) // lower-poly spheres for performance
                .nodeOpacity(1)
                .nodeColor((node) => this.computeNodeColor(node as Graph3DNode & LiveNode))
                .linkColor((link) => this.computeLinkColor(link as LiveLink))
                .linkWidth((link) => this.computeLinkWidth(link as LiveLink))
                .linkOpacity(0.85)
                .linkDirectionalArrowLength(3.5)
                .linkDirectionalArrowRelPos(1)
                .linkDirectionalParticles((link) => this.particlesFor(link as LiveLink))
                .linkDirectionalParticleWidth(2)
                .linkDirectionalParticleSpeed(0.008)
                .nodeVisibility((node) => !this.hiddenNodes.has((node as LiveNode).id ?? ""))
                .linkVisibility((link) => this.isLinkVisible(link as LiveLink))
                .cooldownTime(9000) // settle the simulation sooner → less sustained CPU
                .onNodeHover((node) => this.onHover((node as LiveNode | null)?.id ?? null))
                .onNodeClick((node) => this.onClick((node as LiveNode).id))
                .onNodeRightClick((node, evt) => this.onNodeRightClick((node as LiveNode).id, evt))
                .onLinkClick((link) => this.onLinkClick(link as LiveLink))
                .onBackgroundClick(() => this.clearFocus())
                .onEngineStop(() => this.onEngineSettled());
            this.graph = graph;
            this.spriteTextCtor = SpriteText;
            if (SpriteText) this.attachHubDecorations(graph, SpriteText);
            this.tightenLayout(graph);
            this.applyGraphData();
            this.applySize();
            if (SpriteText && this.three) {
                this.proximityTimer = window.setInterval(() => this.updateProximityLabels(), 300);
            }

            this.resizeObserver = new ResizeObserver(() => this.applySize());
            this.resizeObserver.observe(this.wrapperEl);
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

    /** Hub decorations: a soft additive **glow** + a persistent **label** on the most-connected notes. */
    private attachHubDecorations(graph: ForceGraph3DInstance, SpriteText: new (t?: string, h?: number, c?: string) => LabelSprite): void {
        graph.nodeThreeObjectExtend(true).nodeThreeObject(((node: unknown) => {
            const gn = node as Graph3DNode & LiveNode;
            if (!this.hubIds.has(gn.id ?? "")) return undefined;
            const three = this.three;
            const group = three ? new three.Group() : null;
            if (three && group && this.glowTexture) {
                const material = new three.SpriteMaterial({ map: this.glowTexture, transparent: true, depthWrite: false, blending: three.AdditiveBlending });
                material.opacity = 0.5;
                material.color.set(this.clusterHue(gn.group));
                const glow = new three.Sprite(material);
                const size = Math.sqrt(gn.val) * 7 + 16;
                glow.scale.set(size, size, 1);
                group.add(glow);
            }
            const label = new SpriteText(gn.name, 6, "#e8eaed");
            label.position.set(0, Math.sqrt(gn.val) * 4 + 8, 0);
            if (group && three) {
                group.add(label);
                return group;
            }
            return label;
        }) as never);
    }

    /** A soft radial-gradient texture used for the additive hub glow. */
    private makeGlowTexture(three: typeof THREE): THREE.CanvasTexture {
        const size = 64;
        const canvas = createEl("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
            gradient.addColorStop(0, "rgba(255,255,255,1)");
            gradient.addColorStop(0.3, "rgba(255,255,255,0.45)");
            gradient.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, size, size);
        }
        return new three.CanvasTexture(canvas);
    }

    private clusterHue(group: number): string {
        return group < 0 ? "#9aa4b8" : `hsl(${(group * 67) % 360}, 70%, 62%)`;
    }

    /** Translucent "hull" bubbles around each cluster, rebuilt when the layout settles (#280). */
    private rebuildHulls(): void {
        const three = this.three;
        if (!three || !this.graph || this.lite) return;
        const scene = this.graph.scene();
        this.disposeHulls(scene);
        const live = (this.graph.graphData() as unknown as { nodes: (Graph3DNode & LiveNode)[] }).nodes;
        const byGroup = new Map<number, (Graph3DNode & LiveNode)[]>();
        for (const node of live) {
            if (node.group < 0 || node.x === undefined) continue;
            const arr = byGroup.get(node.group) ?? [];
            arr.push(node);
            byGroup.set(node.group, arr);
        }
        let made = 0;
        for (const [group, nodes] of byGroup) {
            if (nodes.length < 4 || made >= 12) continue; // only real clusters; cap for performance
            let cx = 0, cy = 0, cz = 0;
            for (const n of nodes) { cx += n.x ?? 0; cy += n.y ?? 0; cz += n.z ?? 0; }
            const k = nodes.length; cx /= k; cy /= k; cz /= k;
            let radius = 0;
            for (const n of nodes) radius = Math.max(radius, Math.hypot((n.x ?? 0) - cx, (n.y ?? 0) - cy, (n.z ?? 0) - cz));
            const material = new three.MeshBasicMaterial({ color: new three.Color(this.clusterHue(group)), transparent: true, side: three.BackSide, depthWrite: false });
            material.opacity = 0.06;
            const mesh = new three.Mesh(new three.SphereGeometry(radius + 10, 16, 12), material);
            mesh.position.set(cx, cy, cz);
            scene.add(mesh);
            this.hullMeshes.push(mesh);
            made++;
        }
    }

    private disposeHulls(scene: THREE.Scene): void {
        for (const mesh of this.hullMeshes) {
            scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        this.hullMeshes = [];
    }

    /** Proximity labels (#280): show names for the nearest non-hub nodes so they fade in as you zoom in. */
    private updateProximityLabels(): void {
        const three = this.three;
        const Ctor = this.spriteTextCtor;
        if (!three || !Ctor || !this.graph || this.lite) return;
        const THRESHOLD = 90, MAX = 18;
        const cam = this.graph.cameraPosition();
        const scene = this.graph.scene();
        const live = (this.graph.graphData() as unknown as { nodes: (Graph3DNode & LiveNode)[] }).nodes;

        const near: (Graph3DNode & LiveNode)[] = [];
        for (const node of live) {
            if (!node.id || node.x === undefined || this.hubIds.has(node.id)) continue;
            const d = Math.hypot(node.x - cam.x, (node.y ?? 0) - cam.y, (node.z ?? 0) - cam.z);
            if (d < THRESHOLD) near.push(node);
        }
        near.sort((a, b) => this.camDist(a, cam) - this.camDist(b, cam));
        const keep = near.slice(0, MAX);
        const keepIds = new Set(keep.map((n) => n.id ?? ""));

        for (const [id, sprite] of this.proximityLabels) {
            if (!keepIds.has(id)) {
                scene.remove(sprite);
                this.proximityLabels.delete(id);
            }
        }
        for (const node of keep) {
            const id = node.id;
            let sprite = this.proximityLabels.get(id);
            if (!sprite) {
                sprite = new Ctor(node.name, 5, "#c7ccd6");
                this.proximityLabels.set(id, sprite);
                scene.add(sprite);
            }
            sprite.position.set(node.x ?? 0, (node.y ?? 0) + 6, node.z ?? 0);
        }
    }

    private camDist(node: LiveNode, cam: { x: number; y: number; z: number }): number {
        return Math.hypot((node.x ?? 0) - cam.x, (node.y ?? 0) - cam.y, (node.z ?? 0) - cam.z);
    }

    private clearProximityLabels(): void {
        if (this.graph) {
            const scene = this.graph.scene();
            for (const sprite of this.proximityLabels.values()) scene.remove(sprite);
        }
        this.proximityLabels.clear();
    }

    /** Pull the layout tighter so clusters read as clusters and links stay short + visible. */
    private tightenLayout(graph: ForceGraph3DInstance): void {
        const charge = graph.d3Force("charge") as { strength?(s: number): unknown } | undefined;
        charge?.strength?.(this.chargeStrength());
        const link = graph.d3Force("link") as { distance?(d: number): unknown } | undefined;
        link?.distance?.(38);
    }

    private chargeStrength(): number {
        return -(8 + (this.spread / 100) * 80); // lower spread → weaker repulsion → tighter graph
    }

    private applySpread(value: number): void {
        this.spread = value;
        if (!this.graph) return;
        const charge = this.graph.d3Force("charge") as { strength?(s: number): unknown } | undefined;
        charge?.strength?.(this.chargeStrength());
        this.graph.d3ReheatSimulation();
    }

    /** On the first layout settle, frame the whole graph; otherwise honour a pending deep-link focus. */
    private onEngineSettled(): void {
        this.rebuildHulls(); // cluster bubbles need settled positions
        if (this.pendingFocusPath) {
            this.flyToPendingFocus();
            return;
        }
        if (!this.hasFitted) {
            this.graph?.zoomToFit(700, 60);
            this.hasFitted = true;
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

        const path = controls.createEl("button", { cls: c("graph3d-chip"), text: t("graph3d_path_mode") });
        path.setAttribute("aria-pressed", "false");
        this.pathBtn = path;
        this.registerDomEvent(path, "click", () => this.togglePathMode());

        const fit = controls.createEl("button", { cls: c("graph3d-fit"), text: t("graph3d_fit_view") });
        fit.setAttribute("aria-label", t("graph3d_fit_view"));
        this.registerDomEvent(fit, "click", () => this.graph?.zoomToFit(500, 24));

        const full = controls.createEl("button", { cls: c("graph3d-fit") });
        setIcon(full, "maximize");
        full.setAttribute("aria-label", t("graph3d_fullscreen"));
        this.fullscreenBtn = full;
        this.registerDomEvent(full, "click", () => this.toggleFullscreen());

        const lite = controls.createEl("button", { cls: c("graph3d-chip"), text: t("graph3d_lite") });
        lite.setAttribute("aria-pressed", "false");
        this.liteBtn = lite;
        this.registerDomEvent(lite, "click", () => this.toggleLite());

        this.statusEl = bar.createDiv({ cls: c("graph3d-status") });
    }

    /** Lite mode: drop the per-frame effects (particles, hulls, proximity labels) for maximum FPS. */
    private toggleLite(): void {
        this.lite = !this.lite;
        this.liteBtn?.toggleClass(c("graph3d-chip--active"), this.lite);
        this.liteBtn?.setAttribute("aria-pressed", this.lite ? "true" : "false");
        if (this.lite) {
            if (this.graph && this.three) {
                try { this.disposeHulls(this.graph.scene()); } catch (error) { log.warn("[Graph3D] hull dispose", error); }
            }
            this.clearProximityLabels();
        } else {
            this.rebuildHulls();
        }
        this.refreshPaint();
        this.updateStatus();
    }

    /** Expand the graph to fill the whole window (immersive) and back. */
    private toggleFullscreen(): void {
        this.fullscreen = !this.fullscreen;
        this.wrapperEl?.toggleClass(c("graph3d--fullscreen"), this.fullscreen);
        if (this.fullscreenBtn) setIcon(this.fullscreenBtn, this.fullscreen ? "minimize" : "maximize");
        window.setTimeout(() => this.applySize(), 60);
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

        const spreadBox = bar.createDiv({ cls: c("graph3d-spread") });
        spreadBox.createSpan({ cls: c("graph3d-group-label"), text: t("graph3d_spread_label") });
        const spread = spreadBox.createEl("input", { cls: c("graph3d-spread-slider"), type: "range" });
        spread.min = "0"; spread.max = "100"; spread.value = String(this.spread);
        spread.setAttribute("aria-label", t("graph3d_spread_label"));
        this.registerDomEvent(spread, "input", () => this.applySpread(Number(spread.value)));

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

    private togglePathMode(): void {
        this.pathMode = !this.pathMode;
        this.pathBtn?.toggleClass(c("graph3d-chip--active"), this.pathMode);
        this.pathBtn?.setAttribute("aria-pressed", this.pathMode ? "true" : "false");
        this.pathFrom = null;
        this.pathNodes = null;
        this.pathEdges = null;
        this.refreshPaint();
        this.updateStatus();
    }

    /** In path mode, first click sets the start; the second highlights the shortest path to it. */
    private pickPathNode(id: string): void {
        if (this.pathFrom === null) {
            this.pathFrom = id;
            this.pathNodes = new Set([id]);
            this.pathEdges = new Set();
        } else {
            const path = shortestPath(this.adjacency, this.pathFrom, id);
            this.pathNodes = new Set(path.length ? path : [this.pathFrom, id]);
            this.pathEdges = new Set();
            for (let i = 0; i < path.length - 1; i++) this.pathEdges.add(this.edgeKey(path[i], path[i + 1]));
            if (path.length && this.graph) this.graph.zoomToFit(800, 40, (n) => this.pathNodes?.has((n as LiveNode).id ?? "") ?? false);
            this.pathFrom = null;
        }
        this.hoverId = null;
        this.pinnedId = null;
        this.refreshPaint();
        this.updateStatus();
    }

    /** Clicking a link opens both endpoints (source here, target in a split) so you see the connection. */
    private onLinkClick(link: LiveLink): void {
        const source = endId(link.source);
        const target = endId(link.target);
        if (source) void this.app.workspace.openLinkText(source, "", false);
        if (target && target !== source) void this.app.workspace.openLinkText(target, "", "split");
    }

    private isLinkVisible(link: LiveLink): boolean {
        if (this.hiddenRelations.has(link.type ?? "link")) return false;
        return !this.hiddenNodes.has(endId(link.source)) && !this.hiddenNodes.has(endId(link.target));
    }

    /** Right-click a node → a context menu: open · pin focus · start a path · hide. */
    private onNodeRightClick(id: string | undefined, evt: MouseEvent): void {
        if (typeof id !== "string") return;
        const menu = new Menu();
        menu.addItem((item) => item.setTitle(t("graph3d_menu_open")).setIcon("file").onClick(() => void this.app.workspace.openLinkText(id, "", false)));
        menu.addItem((item) => item.setTitle(t("graph3d_menu_pin")).setIcon("pin").onClick(() => {
            this.pinnedId = id;
            this.hoverId = null;
            this.focusNode(id);
            this.refreshPaint();
            this.updateStatus();
        }));
        menu.addItem((item) => item.setTitle(t("graph3d_menu_path")).setIcon("route").onClick(() => {
            this.pathMode = true;
            this.pathBtn?.toggleClass(c("graph3d-chip--active"), true);
            this.pathBtn?.setAttribute("aria-pressed", "true");
            this.pathFrom = null;
            this.pickPathNode(id);
        }));
        menu.addItem((item) => item.setTitle(t("graph3d_menu_hide")).setIcon("eye-off").onClick(() => {
            this.hiddenNodes.add(id);
            this.refreshPaint();
        }));
        menu.showAtMouseEvent(evt);
    }

    /** Single click pins a neighbourhood (and flies to it); a quick second click opens the note. */
    private onClick(id: string | undefined): void {
        if (typeof id !== "string") return;
        if (this.pathMode) {
            this.pickPathNode(id);
            return;
        }
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
        this.pathFrom = null;
        this.pathNodes = null;
        this.pathEdges = null;
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
            .linkWidth((link) => this.computeLinkWidth(link as LiveLink))
            .linkDirectionalParticles((link) => this.particlesFor(link as LiveLink))
            .nodeVisibility((node) => !this.hiddenNodes.has((node as LiveNode).id ?? ""))
            .linkVisibility((link) => this.isLinkVisible(link as LiveLink));
    }

    // ── Paint ─────────────────────────────────────────────────────────────────
    private computeNodeColor(node: Graph3DNode & LiveNode): string {
        if (this.overlay) {
            return OVERLAY_SPECS[this.overlay].matches(node) ? this.varColor(OVERLAY_SPECS[this.overlay].colorVar) : DIM_NODE;
        }
        if (this.pathNodes) return this.pathNodes.has(node.id ?? "") ? this.baseNodeColor(node) : DIM_NODE;
        const focus = this.activeFocus();
        if (focus && !focus.has(node.id ?? "")) return DIM_NODE;
        return this.baseNodeColor(node);
    }

    private baseNodeColor(node: Graph3DNode): string {
        if (this.colorMode === "state") return STATE_COLORS[node.state] ?? DEFAULT_STATE_COLOR;
        return node.group < 0 ? "#9aa4b8" : `hsl(${(node.group * 67) % 360}, 70%, 66%)`;
    }

    private computeLinkColor(link: LiveLink): string {
        if (this.overlay) return DIM_LINK;
        if (this.pathEdges) return this.pathEdges.has(this.edgeKey(endId(link.source), endId(link.target))) ? this.relationColor(link.type) : DIM_LINK;
        const focus = this.activeFocus();
        if (focus) return focus.has(endId(link.source)) && focus.has(endId(link.target)) ? this.relationColor(link.type) : DIM_LINK;
        return this.relationColor(link.type);
    }

    private computeLinkWidth(link: LiveLink): number {
        if (this.pathEdges) return this.pathEdges.has(this.edgeKey(endId(link.source), endId(link.target))) ? 4 : 0.4;
        const focus = this.activeFocus();
        if (!focus) return 1.6; // bold by default so connections read clearly
        return focus.has(endId(link.source)) && focus.has(endId(link.target)) ? 3.5 : 0.5;
    }

    /** Particle count per link — path/focus links animate; a few on small graphs; none when dense. */
    private particlesFor(link: LiveLink): number {
        if (this.lite) return 0;
        if (this.pathEdges) return this.pathEdges.has(this.edgeKey(endId(link.source), endId(link.target))) ? 4 : 0;
        const focus = this.activeFocus();
        if (focus) return focus.has(endId(link.source)) && focus.has(endId(link.target)) ? 3 : 0;
        return this.displayed.links.length <= 200 ? 1 : 0;
    }

    private edgeKey(a: string, b: string): string {
        return a < b ? `${a}|${b}` : `${b}|${a}`;
    }

    private varColor(varName: string): string {
        const cached = this.colorCache.get(varName);
        if (cached) return cached;
        const value = getComputedStyle(document.body).getPropertyValue(varName).trim() || "#888888";
        this.colorCache.set(varName, value);
        return value;
    }

    private relationColor(type: string | undefined): string {
        const key = type && RELATION_COLORS[type] ? type : "link";
        return RELATION_COLORS[key];
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
        if (this.pathMode) parts.push(t("graph3d_path_mode"));
        if (this.timeCursor !== null) parts.push(t("graph3d_status_timelapse"));
        if (this.lite) parts.push(t("graph3d_lite"));
        this.statusEl.setText(parts.join("  ·  "));
    }

    private renderLegend(): void {
        if (!this.wrapperEl) return;
        this.wrapperEl.querySelector("." + c("graph3d-legend"))?.remove();
        const legend = this.wrapperEl.createDiv({ cls: c("graph3d-legend") });

        // Node colour legend — reflects the active mode so the user knows what colours mean.
        legend.createDiv({ cls: c("graph3d-legend-title"), text: t("graph3d_legend_nodes") });
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
            legend.createDiv({ cls: c("graph3d-legend-title"), text: t("graph3d_legend_title") });
            for (const type of types) {
                const row = legend.createDiv({ cls: c("graph3d-legend-row", "graph3d-legend-row--clickable") });
                row.toggleClass(c("graph3d-legend-row--hidden"), this.hiddenRelations.has(type));
                row.setAttribute("aria-label", this.relationLabel(type));
                row.createSpan({ cls: c("graph3d-swatch", "graph3d-swatch--" + type) });
                row.createSpan({ text: this.relationLabel(type) });
                this.registerDomEvent(row, "click", () => this.toggleRelation(type));
            }
        }
    }

    /** Toggle a relation type's visibility from the legend (click a relation to show only what you want). */
    private toggleRelation(type: string): void {
        if (this.hiddenRelations.has(type)) this.hiddenRelations.delete(type);
        else this.hiddenRelations.add(type);
        this.refreshPaint();
        this.renderLegend();
    }

    private renderFallback(): void {
        this.teardownGraph();
        this.container.empty();
        this.container.createDiv({ cls: c("graph3d-message"), text: t("graph3d_fallback_message") });
    }

    private applySize(): void {
        if (!this.graph) return;
        const el = this.wrapperEl ?? this.container; // in fullscreen the wrapper is the sized element
        this.graph.width(el.clientWidth || 400).height(el.clientHeight || 400);
    }

    private teardownGraph(): void {
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        window.clearInterval(this.timelapseTimer);
        this.timelapseTimer = undefined;
        window.clearInterval(this.proximityTimer);
        this.proximityTimer = undefined;
        if (this.graph && this.three) {
            try {
                this.clearProximityLabels();
                this.disposeHulls(this.graph.scene());
            } catch (error) {
                log.warn("[Graph3D] error disposing graph decorations", error);
            }
        }
        this.spriteTextCtor = null;
        this.glowTexture = null;
        this.three = null;
        this.colorButtons.clear();
        this.lensChips.clear();
        this.zoomSlider = null;
        this.timeSlider = null;
        this.playBtn = null;
        this.pathBtn = null;
        this.fullscreenBtn = null;
        this.fullscreen = false;
        this.liteBtn = null;
        this.statusEl = null;
        this.hoverId = null;
        this.pinnedId = null;
        this.pathNodes = null;
        this.pathEdges = null;
        this.pathFrom = null;
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
