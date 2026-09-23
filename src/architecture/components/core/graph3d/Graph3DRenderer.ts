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
    Graph3DLink,
    Graph3DNode,
    OverlayKind,
    OVERLAY_KINDS,
    OVERLAY_SPECS,
    RELATION_COLOR_VARS,
    RELATION_COLORS,
    communityColor,
    shortestPath,
    tourStops,
    STATE_COLOR_VARS,
    STATE_COLORS,
    openGapCount,
    openGaps,
} from "architecture/knowledge/state";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import { consumeGraph3DFocus } from "./graph3dFocus";
import { GAP_DRAW_MAX, ghostKey, selectGhosts, type GhostEdge } from "./graph3dGhosts";
import {
    belongsToCommunity,
    communityFrameKey,
    neighbourhoodRows,
    paletteOf,
    regionFrameKey,
    type NeighbourhoodRow,
} from "./graph3dLegend";
import { environmentEnabled, starfieldPositions, haloSpec } from "./graph3dEnvironment";
import { buildExportBaseName } from "../export/exportFilename";
import { canvasToPngBlob, pickVideoMimeType, recordCanvasWebm } from "../export/mediaCapture";
import { ExportShareModal } from "../export/ExportShareModal";
// Type-only imports — erased at compile time, so the WebGL libraries load lazily in mountGraph().
import type { ForceGraph3DInstance } from "3d-force-graph";
import type * as THREE from "three";

const DEBOUNCE_MS = 700;
const DIM_NODE = "rgba(120, 124, 135, 0.10)";
const DIM_LINK = "rgba(120, 124, 135, 0.04)";
const TIMELAPSE_MS = 9000;
const TIMELAPSE_STEPS = 48;
// A1 (#384) — the immersive starfield: a single Points cloud on a shell wrapping the graph.
const STAR_COUNT = 1400;
const STAR_INNER_RADIUS = 320;
const STAR_OUTER_RADIUS = 900;
type ViewState = "indexing" | "ready" | "empty" | "error";
// "neighbourhood", not "region" (#527 follow-up): this mode colours Louvain communities, and
// a type saying one thing while the product says another is how the next reader gets it wrong.
type ColorMode = "state" | "neighbourhood";
type LiveNode = { id?: string; x?: number; y?: number; z?: number; vx?: number; vy?: number; vz?: number };
type LiveLink = { source: string | LiveNode; target: string | LiveNode; type?: string };
type LabelSprite = THREE.Sprite; // three-spritetext's SpriteText extends three's Sprite (an Object3D)
const endId = (end: string | LiveNode): string => (typeof end === "object" ? end.id ?? "" : end);
const HUB_LABEL_COUNT = 18;
/** Smallest region that earns a bubble of its own (#515). Below it the hull is noise. */
const HULL_MIN_NODES = 3;
/** How often the hulls follow the moving layout (#520) — cheap, because an update reuses everything. */
const HULL_REFRESH_MS = 250;
/**
 * The colour of a line that is not there (#532). Pink, because none of the relation types use it
 * and a ghost must not read as a kind of link: `--color-pink` is the lens chip's swatch and this
 * is its scene twin, tuned like the rest for the view's fixed dark background.
 */
const GHOST_COLOR = "#f9a8d4";

function webglAvailable(): boolean {
    try {
        const canvas = createEl("canvas");
        return !!(window.WebGLRenderingContext && (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")));
    } catch {
        return false;
    }
}

/** Whether the user asked the OS to minimize animation (#319 S4) — the graph then settles instantly. */
function prefersReducedMotion(): boolean {
    try {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    /**
     * When the active lens is about **links** (#526), the notes at the ends of the matching ones.
     * Computed once per lens change rather than per node per frame.
     */
    private edgeLensEndpoints: Set<string> | null = null;
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
    private starfield: THREE.Points | null = null;
    private bloomPass: { enabled: boolean; dispose?(): void } | null = null;
    private reducedMotion = false;
    private activeRecorder: MediaRecorder | null = null;
    private tourActive = false;
    private tourTimer: number | undefined;
    private tourIndex = 0;
    private tourStopIds: string[] = [];
    private tourBtn: HTMLElement | null = null;
    /**
     * The hulls, kept **per region** and updated in place (#520). They used to be an array,
     * disposed and rebuilt wholesale, which is why rebuilding was expensive enough to defer to
     * the nine-second settle.
     */
    private readonly hulls = new Map<number, THREE.Mesh>();
    /** One name per hull (#514) — same lifecycle as the hulls, so neither can outlive the other. */
    private readonly regionLabels = new Map<number, LabelSprite>();
    /** What each label currently reads, so a sprite is only rasterised again when it changed. */
    private readonly labelNames = new Map<number, string>();
    /** One unit sphere for every hull (#520); each mesh scales it to its own radius. */
    private hullGeometry: THREE.SphereGeometry | null = null;
    private hullTimer: number | undefined;
    /** What the camera is currently framing (#515) — a community or a region — or null for all. */
    private framedKey: string | null = null;
    /** The note this view was opened *on* (#517), until you pin something or clear the focus. */
    private arrivedAt: string | null = null;
    private spriteTextCtor: (new (t?: string, h?: number, c?: string) => LabelSprite) | null = null;
    private readonly proximityLabels = new Map<string, LabelSprite>();
    private proximityTimer: number | undefined;
    private lastRevision = -1;
    private visibilityObserver: IntersectionObserver | null = null;
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
    /** The options popover while it is open, and `null` while it is not (#542). */
    private settingsEl: HTMLElement | null = null;
    /** The gear that opens it — kept so its pressed state and `aria-expanded` stay true. */
    private settingsBtn: HTMLElement | null = null;
    /**
     * How many gaps there are, or `null` until the lens is first used (#532). Kept on the renderer
     * rather than read per render for the reason in `buildTopBar`: the number costs the shared gap
     * pass, and nothing should pay for it before someone asks.
     */
    private gapTotal: number | null = null;
    /** The strongest gaps, as of {@link gapRevision} — the candidates the lens draws from. */
    private gapStrongest: GhostEdge[] = [];
    /** The model revision the two above were read at; `-1` until the lens is first used. */
    private gapRevision = -1;
    /**
     * How many pairs were ruled out when they were read (#534). The revision alone is not enough to
     * know they are still current: saying *not related* in Home changes the judgement record and
     * **not** the model, so a cache keyed on the revision would draw a gap you had just dismissed
     * until the next edit to the vault.
     */
    private gapVerdicts = -1;
    /** The ghost edges the scene is currently drawing, recomputed when the lens or the graph moves. */
    private ghosts: GhostEdge[] = [];
    /**
     * The drawn lines, keyed by the pair, with the same lifecycle as the hulls (#520): kept across
     * updates, repositioned in place, dropped when they stop being wanted.
     */
    private readonly ghostLines = new Map<string, THREE.Line>();
    /** One material for every ghost — they are all the same faint dash. */
    private ghostMaterial: THREE.LineDashedMaterial | null = null;
    /** Logged once per activation, not once per tick, when `three` is not there to draw with. */
    private ghostWarned = false;
    private timeSlider: HTMLInputElement | null = null;
    private playBtn: HTMLElement | null = null;

    /**
     * `lit` is the Explore selection (#484): the graph draws your whole vault, with those notes
     * painted and everything else dimmed — the selection **in context**, which is the only way a
     * graph answers anything a list cannot. It rides the dimming path `pathNodes` already drives,
     * so a lens costs a parameter rather than a scoping engine.
     */
    constructor(container: HTMLElement, private readonly app: App, private lit: ReadonlySet<string> | null = null) {
        super(container);
    }

    /** Re-light without rebuilding: the selection changed, the graph and its layout did not. */
    setLit(lit: ReadonlySet<string> | null): void {
        this.lit = lit;
        this.refreshPaint();
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
            const model = index.getModel();
            // Fast path (#302 S4): the model hasn't changed since our last build — skip the whole
            // O(n) projection. `resolved` fires far more often than the graph actually changes.
            const revision = model.revision();
            if (this.graph && this.state === "ready" && revision === this.lastRevision) return;
            this.lastRevision = revision;
            const next = build3DGraph(model); // show every indexed note (no cap, #280 direction)
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

            const reduced = prefersReducedMotion();
            this.reducedMotion = reduced;
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
                .linkDirectionalParticles((link) => (reduced ? 0 : this.particlesFor(link as LiveLink)))
                .linkDirectionalParticleWidth(2)
                .linkDirectionalParticleSpeed(0.008)
                .nodeVisibility((node) => !this.hiddenNodes.has((node as LiveNode).id ?? ""))
                .linkVisibility((link) => this.isLinkVisible(link as LiveLink))
                // Reduced-motion (#319 S4): settle almost instantly instead of a long animated warmup.
                .cooldownTime(reduced ? 200 : 9000)
                .warmupTicks(reduced ? 120 : 0)
                .onNodeHover((node) => this.onHover((node as LiveNode | null)?.id ?? null))
                .onNodeClick((node) => this.onClick((node as LiveNode).id))
                .onNodeRightClick((node, evt) => this.onNodeRightClick((node as LiveNode).id, evt))
                .onLinkClick((link) => this.onLinkClick(link as LiveLink))
                .onBackgroundClick(() => this.clearFocus())
                .onEngineStop(() => this.onEngineSettled());
            this.graph = graph;
            this.spriteTextCtor = SpriteText;
            if (SpriteText) this.attachNodeDecorations(graph);
            this.tightenLayout(graph);
            this.applyGraphData();
            this.applySize();
            // A1 (#384): the immersive environment is purely additive and follows the env gate — it
            // never blocks or blanks the base render above.
            this.buildEnvironment();
            void this.applyBloom();
            this.wrapperEl?.toggleClass(c("graph3d--immersive"), this.envEnabled());
            if (SpriteText && this.three) {
                this.proximityTimer = window.setInterval(() => this.updateProximityLabels(), 300);
            }
            // #520: the hulls follow the layout instead of waiting nine seconds for it to stop.
            this.hullTimer = window.setInterval(() => this.refreshSceneObjects(), HULL_REFRESH_MS);

            this.resizeObserver = new ResizeObserver(() => this.applySize());
            this.resizeObserver.observe(this.wrapperEl);

            // Stop burning CPU/GPU when this tab is hidden in a background split (#302 S4): pause the
            // WebGL render loop and the proximity-label interval until it's on screen again.
            const canLabel = SpriteText != null && this.three != null;
            this.visibilityObserver = new IntersectionObserver((entries) => {
                this.setActive(entries.some((entry) => entry.isIntersecting), canLabel);
            });
            this.visibilityObserver.observe(this.wrapperEl);

            // A2 (#385): any direct interaction cancels an active cinematic tour.
            this.registerDomEvent(this.graphEl, "pointerdown", () => this.stopTour());
            this.registerDomEvent(this.graphEl, "wheel", () => this.stopTour());
            this.registerDomEvent(this.graphEl, "keydown", () => this.stopTour());
        } catch (error) {
            log.error("[Graph3D] could not initialize the 3D graph (WebGL unavailable?)", error);
            if (this.disposed) return;
            this.container.empty();
            this.container.createDiv({ cls: c("graph3d-message"), text: t("graph3d_state_error") });
        }
    }

    /** Pause/resume the render loop + proximity interval when the tab is hidden/shown (#302 S4). */
    private setActive(active: boolean, canLabel: boolean): void {
        if (!this.graph) return;
        const anim = this.graph as unknown as { pauseAnimation?: () => void; resumeAnimation?: () => void };
        if (active) {
            anim.resumeAnimation?.();
            if (canLabel && this.proximityTimer === undefined) {
                this.proximityTimer = window.setInterval(() => this.updateProximityLabels(), 300);
            }
            if (this.hullTimer === undefined) {
                this.hullTimer = window.setInterval(() => this.refreshSceneObjects(), HULL_REFRESH_MS);
            }
            if (this.tourActive && this.tourTimer === undefined) this.advanceTour(); // resume the tour on screen
        } else {
            anim.pauseAnimation?.();
            window.clearInterval(this.proximityTimer);
            this.proximityTimer = undefined;
            window.clearInterval(this.hullTimer);
            this.hullTimer = undefined;
            window.clearTimeout(this.tourTimer); // pause the tour while off-screen
            this.tourTimer = undefined;
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
        // A link lens caches the notes its edges join, so it has to be recomputed whenever the
        // displayed set moves under it — a time cursor, a reindex (#526).
        this.syncEdgeLens();
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

    /** Node decorations: a cluster-hued **glow halo** (hubs always; other meaningful nodes only in the
     *  immersive environment, #384), a **label** on hubs, and a **type icon** (`?` question, `◆`
     *  source). The per-node builder is reused by {@link refreshDecorations} when Lite toggles. */
    private attachNodeDecorations(graph: ForceGraph3DInstance): void {
        graph.nodeThreeObjectExtend(true).nodeThreeObject(((node: unknown) => this.buildNodeObject(node)) as never);
    }

    /** Re-evaluate every node's decorations (e.g. after Lite toggles the non-hub halos on/off). */
    private refreshDecorations(): void {
        if (this.graph && this.spriteTextCtor) {
            this.graph.nodeThreeObject(((node: unknown) => this.buildNodeObject(node)) as never);
        }
    }

    /** Build the three.js decoration object for one node (glow halo + hub label + kind icon). */
    private buildNodeObject(node: unknown): THREE.Object3D | undefined {
        const SpriteText = this.spriteTextCtor;
        if (!SpriteText) return undefined;
        const gn = node as Graph3DNode & LiveNode;
        const isHub = this.hubIds.has(gn.id ?? "");
        const icon = gn.kind === "question" ? "?" : gn.kind === "source" ? "◆" : "";
        const three = this.three;
        // Hubs always glow; non-hub halos appear only in the immersive environment (dropped in Lite).
        const halo = three && this.glowTexture && (isHub || this.envEnabled()) ? haloSpec(gn.val, isHub) : null;
        if (!isHub && !icon && !halo) return undefined;
        if (!three) {
            if (isHub) {
                const label = new SpriteText(gn.name, 6, "#e8eaed");
                label.position.set(0, Math.sqrt(gn.val) * 4 + 8, 0);
                return label;
            }
            return undefined;
        }
        const group = new three.Group();
        if (halo && this.glowTexture) {
            const material = new three.SpriteMaterial({ map: this.glowTexture, transparent: true, depthWrite: false, blending: three.AdditiveBlending });
            material.opacity = halo.opacity;
            material.color.set(communityColor(gn.community));
            const glow = new three.Sprite(material);
            glow.scale.set(halo.scale, halo.scale, 1);
            group.add(glow);
        }
        if (isHub) {
            const label = new SpriteText(gn.name, 6, "#e8eaed");
            label.position.set(0, Math.sqrt(gn.val) * 4 + 8, 0);
            group.add(label);
        }
        if (icon) {
            const offset = Math.sqrt(gn.val) * 3 + 5;
            const iconSprite = new SpriteText(icon, 6, gn.kind === "question" ? "#fbbf24" : "#22d3ee");
            iconSprite.position.set(offset, offset, 0);
            group.add(iconSprite);
        }
        return group;
    }

    // ── A1 (#384): the immersive "Knowledge Galaxy" environment ─────────────────
    /** Whether the additive environment (starfield + non-hub halos + bloom) should run right now. */
    private envEnabled(): boolean {
        return environmentEnabled({ reduced: this.reducedMotion, lite: this.lite, webgl: true, mobile: Platform.isMobile });
    }

    /** Build the additive starfield backdrop — one `Points` draw call. Best-effort; never blanks the graph. */
    private buildEnvironment(): void {
        const three = this.three;
        if (!three || !this.graph || this.starfield || !this.envEnabled()) return;
        try {
            const positions = starfieldPositions(STAR_COUNT, STAR_INNER_RADIUS, STAR_OUTER_RADIUS, Math.random);
            const geometry = new three.BufferGeometry();
            geometry.setAttribute("position", new three.BufferAttribute(positions, 3));
            const material = new three.PointsMaterial({
                size: 1.6,
                color: new three.Color("#cbd5e1"),
                transparent: true,
                opacity: 0.65,
                sizeAttenuation: true,
                depthWrite: false,
                blending: three.AdditiveBlending,
            });
            const points = new three.Points(geometry, material);
            this.starfield = points;
            this.graph.scene().add(points);
        } catch (error) {
            log.warn("[Graph3D] starfield unavailable", error);
        }
    }

    /** Selective bloom via the library's post-processing composer — best-effort and defensive across
     *  library updates. A failure degrades to lit spheres (the base render already ran), never a blank. */
    private async applyBloom(): Promise<void> {
        const three = this.three;
        if (!three || !this.graph || this.bloomPass || !this.envEnabled()) return;
        try {
            const { UnrealBloomPass } = await import("three/examples/jsm/postprocessing/UnrealBloomPass.js");
            if (this.disposed || !this.graph) return;
            const composer = (this.graph as unknown as {
                postProcessingComposer?: () => { addPass(pass: unknown): void } | undefined;
            }).postProcessingComposer?.();
            if (!composer) return;
            const width = this.wrapperEl?.clientWidth || 400;
            const height = this.wrapperEl?.clientHeight || 400;
            // Conservative strength/radius/threshold so bloom accents hubs without washing out light themes.
            const pass = new UnrealBloomPass(new three.Vector2(width, height), 0.7, 0.6, 0.65);
            composer.addPass(pass);
            this.bloomPass = pass; // UnrealBloomPass structurally satisfies { enabled; dispose? }
        } catch (error) {
            log.warn("[Graph3D] selective bloom unavailable", error);
        }
    }

    private disposeStarfield(): void {
        if (this.starfield && this.graph && this.three) {
            try {
                this.graph.scene().remove(this.starfield);
                this.starfield.geometry.dispose();
                this.starfield.material.dispose();
            } catch (error) {
                log.warn("[Graph3D] error disposing starfield", error);
            }
        }
        this.starfield = null;
    }

    // ── A3 (#386): "share your universe" — export the view ───────────────────────
    /** Offer an image or a time-lapse clip (clip only when the device can record WebM). */
    private openExportMenu(evt: MouseEvent): void {
        const menu = new Menu();
        menu.addItem((item) => item.setTitle(t("graph3d_export_png")).setIcon("image").onClick(() => void this.exportImage()));
        if (pickVideoMimeType()) {
            menu.addItem((item) => item.setTitle(t("graph3d_export_clip")).setIcon("video").onClick(() => void this.exportClip()));
        }
        menu.showAtMouseEvent(evt);
    }

    /** Frame the whole graph, then capture the live canvas to a PNG and open the share dialog. */
    private async exportImage(): Promise<void> {
        const canvas = this.captureCanvas();
        if (!canvas || !this.graph) return;
        try {
            this.graph.zoomToFit(700, 40); // frame every cluster before the capture
            await this.settle(800); // let the fit animation finish
            const blob = await canvasToPngBlob(canvas, () => this.forceRender());
            new ExportShareModal(this.app, { blob, baseName: buildExportBaseName("universe", new Date()), kind: "image" }).open();
        } catch (error) {
            log.error("[Graph3D] image export failed", error);
        }
    }

    /** Record the time-lapse from the start into a short WebM clip, then open the share dialog. */
    private async exportClip(): Promise<void> {
        const canvas = this.captureCanvas();
        const mimeType = pickVideoMimeType();
        if (!canvas || !mimeType) return;
        try {
            if (this.timeSlider) this.timeSlider.value = "0";
            this.scrubTime(0);
            if (this.timelapseTimer === undefined) this.toggleTimelapse(); // play the growth
            const blob = await recordCanvasWebm(canvas, {
                durationMs: TIMELAPSE_MS + 600,
                mimeType,
                onRecorder: (recorder) => (this.activeRecorder = recorder),
            });
            this.activeRecorder = null;
            new ExportShareModal(this.app, { blob, baseName: buildExportBaseName("universe-timelapse", new Date()), kind: "video" }).open();
        } catch (error) {
            this.activeRecorder = null;
            log.error("[Graph3D] clip recording failed", error);
        }
    }

    private captureCanvas(): HTMLCanvasElement | null {
        return (this.graphEl?.querySelector("canvas") as HTMLCanvasElement | null) ?? null;
    }

    private settle(ms: number): Promise<void> {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    /** Force a synchronous WebGL re-render before reading the canvas (the buffer is cleared per frame). */
    private forceRender(): void {
        const g = this.graph as unknown as {
            renderer?: () => { render(scene: unknown, camera: unknown): void } | undefined;
            scene?: () => unknown;
            camera?: () => unknown;
        };
        try {
            const renderer = g.renderer?.();
            const scene = g.scene?.();
            const camera = g.camera?.();
            if (renderer && scene && camera) renderer.render(scene, camera);
        } catch (error) {
            log.warn("[Graph3D] forceRender unavailable", error);
        }
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

    /**
     * Translucent "hull" bubbles around each region, with its name above it (#280, #514).
     *
     * Updated **in place** and driven by a timer (#520), so the spheres grow with the layout
     * instead of appearing when it stops. They used to be built once at `onEngineStop`, which
     * fires when `cooldownTime` expires — nine seconds of waiting for geometry that takes
     * microseconds. Calling this continuously is only affordable because a call now allocates
     * nothing it can reuse: one shared unit sphere scaled per region, one material and one sprite
     * per region kept across updates, and a label re-rasterised only when its text changes.
     */
    private rebuildHulls(): void {
        const three = this.three;
        if (!three || !this.graph || this.lite) return;
        const scene = this.graph.scene();
        const live = (this.graph.graphData() as unknown as { nodes: (Graph3DNode & LiveNode)[] }).nodes;
        // Grouped by **community**, not by region (#527). A region is a connected component, and
        // on the reference vault one of them holds 59 % of the notes: a single sphere around most
        // of the graph. Its 17 communities are 9 to 36 notes each — bubbles that mean something.
        const byGroup = new Map<number, (Graph3DNode & LiveNode)[]>();
        for (const node of live) {
            if (node.community < 0 || node.x === undefined) continue;
            const arr = byGroup.get(node.community) ?? [];
            arr.push(node);
            byGroup.set(node.community, arr);
        }
        if (!this.hullGeometry) this.hullGeometry = new three.SphereGeometry(1, 16, 12);

        const present = new Set<number>();
        for (const [group, nodes] of byGroup) {
            // The cap of twelve went with #515: it was written when a 421-note vault produced 31
            // regions covering a quarter of it. An honest partition gives single digits.
            if (nodes.length < HULL_MIN_NODES) continue;
            present.add(group);
            let cx = 0, cy = 0, cz = 0;
            for (const n of nodes) { cx += n.x ?? 0; cy += n.y ?? 0; cz += n.z ?? 0; }
            const k = nodes.length; cx /= k; cy /= k; cz /= k;
            let radius = 0;
            for (const n of nodes) radius = Math.max(radius, Math.hypot((n.x ?? 0) - cx, (n.y ?? 0) - cy, (n.z ?? 0) - cz));

            let mesh = this.hulls.get(group);
            if (!mesh) {
                const material = new three.MeshBasicMaterial({ color: new three.Color(communityColor(group)), transparent: true, side: three.BackSide, depthWrite: false });
                material.opacity = 0.06;
                mesh = new three.Mesh(this.hullGeometry, material);
                scene.add(mesh);
                this.hulls.set(group, mesh);
            }
            mesh.position.set(cx, cy, cz);
            mesh.scale.setScalar(radius + 10);

            // The name, above the bubble (#514). Larger and dimmer than a node label, so it reads
            // as the region rather than as one more note in it.
            const Ctor = this.spriteTextCtor;
            const name = nodes.find((node) => node.communityName)?.communityName;
            if (!Ctor || !name) continue;
            let label = this.regionLabels.get(group);
            if (!label || this.labelNames.get(group) !== name) {
                if (label) scene.remove(label);
                label = new Ctor(name, 11, communityColor(group));
                scene.add(label);
                this.regionLabels.set(group, label);
                this.labelNames.set(group, name);
            }
            label.position.set(cx, cy + radius + 18, cz);
        }

        // A region that stopped existing (a rename, a deletion, a time cursor) takes its bubble
        // with it; everything else is left alone, which is the whole point.
        for (const group of [...this.hulls.keys()]) {
            if (present.has(group)) continue;
            this.dropHull(scene, group);
        }
    }

    /**
     * The scene objects that follow the layout (#520, #532) — the hulls and the ghost edges — on
     * one interval, because they answer the same question: *where are the notes right now?*
     */
    private refreshSceneObjects(): void {
        this.rebuildHulls();
        this.rebuildGhosts();
    }

    /**
     * A dashed line where a link is **not** (#532).
     *
     * Drawn as scene objects, never as graph links: `3d-force-graph` runs d3-force over the links
     * it is given, so a candidate edge added there would make the layout **pull the two notes
     * together** — the graph would rearrange itself around links that do not exist, which is worse
     * than saying nothing. Nothing here touches `graphData`, and nothing writes a node position.
     *
     * The lifecycle is the hulls': one shared material, a line per pair kept across ticks and
     * repositioned in place, and anything no longer wanted removed and disposed. The wanted set is
     * recomputed from the active lens every tick, so clearing the lens (a background click, a
     * reindex) self-heals within 250 ms with no hook of its own.
     */
    private rebuildGhosts(): void {
        const three = this.three;
        if (!three || !this.graph || this.lite) return;
        const scene = this.graph.scene();
        const wanted = this.overlay === "gaps" ? this.ghosts : [];

        if (wanted.length > 0) {
            const live = (this.graph.graphData() as unknown as { nodes: (Graph3DNode & LiveNode)[] }).nodes;
            const at = new Map<string, Graph3DNode & LiveNode>();
            for (const node of live) if (node.x !== undefined) at.set(node.id, node);

            if (!this.ghostMaterial) {
                this.ghostMaterial = new three.LineDashedMaterial({
                    color: new three.Color(GHOST_COLOR),
                    transparent: true,
                    opacity: 0.55,
                    dashSize: 4,
                    gapSize: 4,
                    depthWrite: false,
                });
            }

            for (const ghost of wanted) {
                const from = at.get(ghost.a);
                const to = at.get(ghost.b);
                if (!from || !to) continue;
                const key = ghostKey(ghost);
                let line = this.ghostLines.get(key);
                if (!line) {
                    const geometry = new three.BufferGeometry();
                    geometry.setAttribute("position", new three.BufferAttribute(new Float32Array(6), 3));
                    line = new three.Line(geometry, this.ghostMaterial);
                    line.renderOrder = -1; // under the real links, so what exists reads first
                    scene.add(line);
                    this.ghostLines.set(key, line);
                }
                const position = line.geometry.getAttribute("position");
                if (!position) continue;
                position.array[0] = from.x ?? 0;
                position.array[1] = from.y ?? 0;
                position.array[2] = from.z ?? 0;
                position.array[3] = to.x ?? 0;
                position.array[4] = to.y ?? 0;
                position.array[5] = to.z ?? 0;
                position.needsUpdate = true;
                // Dashes are measured along the line, so they stretch unless this runs after a move.
                line.computeLineDistances();
            }
        }

        const keep = new Set(wanted.map(ghostKey));
        for (const key of [...this.ghostLines.keys()]) {
            if (!keep.has(key)) this.dropGhost(scene, key);
        }
    }

    private dropGhost(scene: THREE.Scene, key: string): void {
        const line = this.ghostLines.get(key);
        if (!line) return;
        scene.remove(line);
        line.geometry.dispose(); // the material is shared and outlives every line
        this.ghostLines.delete(key);
    }

    private disposeGhosts(scene: THREE.Scene): void {
        for (const key of [...this.ghostLines.keys()]) this.dropGhost(scene, key);
        this.ghostMaterial?.dispose();
        this.ghostMaterial = null;
    }

    private dropHull(scene: THREE.Scene, group: number): void {
        const mesh = this.hulls.get(group);
        if (mesh) {
            scene.remove(mesh);
            mesh.material.dispose(); // the geometry is shared and outlives every hull
            this.hulls.delete(group);
        }
        const label = this.regionLabels.get(group);
        if (label) scene.remove(label);
        this.regionLabels.delete(group);
        this.labelNames.delete(group);
    }

    private disposeHulls(scene: THREE.Scene): void {
        for (const group of [...this.hulls.keys()]) this.dropHull(scene, group);
        // The shared unit sphere is the one thing not owned by a single hull (#520).
        this.hullGeometry?.dispose();
        this.hullGeometry = null;
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

    // ── Top bar: search · fit · the gear · status ───────────────────────────
    /**
     * What stays on the canvas, and why so little (#542).
     *
     * This bar held **sixteen** controls and the bottom bar six more, grown one honest addition at
     * a time — three lenses in #280, four more by #532, the environment, the tour, the export —
     * until nobody could find anything. Obsidian's own graph answers this with a gear and a
     * popover, and that is the pattern to match rather than invent (§III).
     *
     * So the canvas keeps what is used *while looking*: find a note, frame the graph, read what
     * you are looking at. Everything else is one click away, grouped by the question it answers.
     */
    private buildTopBar(parent: HTMLElement): void {
        const bar = parent.createDiv({ cls: c("graph3d-topbar") });
        const controls = bar.createDiv({ cls: c("graph3d-controls") });

        const search = controls.createEl("input", { cls: c("graph3d-search"), type: "search" });
        search.placeholder = t("graph3d_search_placeholder");
        search.setAttribute("aria-label", t("graph3d_search_placeholder"));
        this.registerDomEvent(search, "input", () => this.focusByName(search.value));

        const fit = controls.createEl("button", { cls: c("graph3d-fit"), text: t("graph3d_fit_view") });
        fit.setAttribute("aria-label", t("graph3d_fit_view"));
        this.registerDomEvent(fit, "click", () => this.graph?.zoomToFit(500, 24));

        const gear = controls.createEl("button", { cls: c("graph3d-fit") });
        setIcon(gear, "settings-2");
        gear.setAttribute("aria-label", t("graph3d_settings"));
        gear.setAttribute("aria-expanded", "false");
        this.settingsBtn = gear;
        this.registerDomEvent(gear, "click", () => this.toggleSettings());

        this.statusEl = bar.createDiv({ cls: c("graph3d-status") });
    }

    /**
     * Everything that is not *looking* (#542), in five groups named after the question each
     * answers. A move, not a redesign: every control keeps its label, its handler and its state.
     */
    private buildSettingsPanel(parent: HTMLElement): HTMLElement {
        const panel = parent.createDiv({ cls: c("graph3d-settings") });
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", t("graph3d_settings"));

        // ── See ──
        const see = this.settingsGroup(panel, "graph3d_settings_see");
        const segmented = see.createDiv({ cls: c("graph3d-segmented") });
        this.addColorButton(segmented, "state", t("graph3d_color_state"));
        this.addColorButton(segmented, "neighbourhood", t("graph3d_color_neighbourhood"));
        const lite = see.createEl("button", { cls: c("graph3d-chip"), text: t("graph3d_lite") });
        lite.setAttribute("aria-pressed", this.lite ? "true" : "false");
        lite.toggleClass(c("graph3d-chip--active"), this.lite);
        this.liteBtn = lite;
        this.registerDomEvent(lite, "click", () => this.toggleLite());
        const full = see.createEl("button", { cls: c("graph3d-chip"), text: t("graph3d_fullscreen") });
        full.setAttribute("aria-label", t("graph3d_fullscreen"));
        this.fullscreenBtn = full;
        this.registerDomEvent(full, "click", () => this.toggleFullscreen());

        // ── Lenses ──
        const lensGroup = this.settingsGroup(panel, "graph3d_group_lens");
        const stats = graph3dStats(this.data);
        // `null` is "no count yet", and only the gap lens can be in that state (#532): the other
        // six fall out of `graph3dStats`, which walks the graph the view already built, while this
        // one costs the shared gap pass -- 982 ms over ten thousand notes. A view that spent a
        // second rendering a number nobody asked for is what #458 exists to prevent, so the count
        // arrives the first time the lens is used and behaves like every other one from then on.
        const counts: Record<OverlayKind, number | null> = { "orphans": stats.orphans, "dead-ends": stats.deadEnds, "contradictions": stats.contradictions, "alone": stats.alone, "frontier": stats.frontier, "bridges": stats.bridges, "gaps": this.gapTotal };
        this.lensChips.clear();
        for (const kind of OVERLAY_KINDS) this.addLensChip(lensGroup, kind, counts[kind]);
        const path = lensGroup.createEl("button", { cls: c("graph3d-chip"), text: t("graph3d_path_mode") });
        path.setAttribute("aria-pressed", this.pathMode ? "true" : "false");
        path.toggleClass(c("graph3d-chip--active"), this.pathMode);
        this.pathBtn = path;
        this.registerDomEvent(path, "click", () => this.togglePathMode());

        // ── Movement ──
        const movement = this.settingsGroup(panel, "graph3d_settings_movement");
        movement.createSpan({ cls: c("graph3d-group-label"), text: t("graph3d_spread_label") });
        const spread = movement.createEl("input", { cls: c("graph3d-spread-slider"), type: "range" });
        spread.min = "0"; spread.max = "100"; spread.value = String(this.spread);
        spread.setAttribute("aria-label", t("graph3d_spread_label"));
        this.registerDomEvent(spread, "input", () => this.applySpread(Number(spread.value)));

        // ── Time ──
        const time = this.settingsGroup(panel, "graph3d_settings_time");
        this.playBtn = time.createEl("button", { cls: c("graph3d-play"), text: t("graph3d_timelapse_play") });
        this.registerDomEvent(this.playBtn, "click", () => this.toggleTimelapse());
        const slider = time.createEl("input", { cls: c("graph3d-time-slider"), type: "range" });
        slider.min = "0"; slider.max = "100"; slider.value = "100";
        slider.setAttribute("aria-label", t("graph3d_timelapse_play"));
        this.timeSlider = slider;
        this.registerDomEvent(slider, "input", () => this.scrubTime(Number(slider.value)));

        // ── Share ──
        const share = this.settingsGroup(panel, "graph3d_settings_share");
        const tour = share.createEl("button", { cls: c("graph3d-chip"), text: t("graph3d_tour_play") });
        tour.setAttribute("aria-pressed", this.tourActive ? "true" : "false");
        this.tourBtn = tour;
        this.registerDomEvent(tour, "click", () => this.toggleTour());
        const exportBtn = share.createEl("button", { cls: c("graph3d-chip"), text: t("graph3d_export") });
        exportBtn.setAttribute("aria-label", t("graph3d_export"));
        this.registerDomEvent(exportBtn, "click", (evt) => this.openExportMenu(evt));

        return panel;
    }

    /** One named group in the popover — a heading and the row of controls under it. */
    private settingsGroup(panel: HTMLElement, labelKey: Parameters<typeof t>[0]): HTMLElement {
        const group = panel.createDiv({ cls: c("graph3d-settings-group") });
        group.createDiv({ cls: c("graph3d-group-label"), text: t(labelKey) });
        return group.createDiv({ cls: c("graph3d-settings-row") });
    }

    /**
     * Open or close the popover. Closing is three gestures, because a panel you cannot dismiss the
     * way you expect is worse than one more button: the gear again, `Escape`, or a click outside.
     */
    private toggleSettings(): void {
        if (this.settingsEl) {
            this.closeSettings();
            return;
        }
        if (!this.wrapperEl) return;
        this.settingsEl = this.buildSettingsPanel(this.wrapperEl);
        this.settingsBtn?.setAttribute("aria-expanded", "true");
        this.settingsBtn?.addClass(c("graph3d-chip--active"));
    }

    private closeSettings(): void {
        this.settingsEl?.remove();
        this.settingsEl = null;
        this.settingsBtn?.setAttribute("aria-expanded", "false");
        this.settingsBtn?.removeClass(c("graph3d-chip--active"));
    }

    /** Lite mode: drop the per-frame effects (particles, hulls, proximity labels) for maximum FPS. */
    private toggleLite(): void {
        this.lite = !this.lite;
        this.liteBtn?.toggleClass(c("graph3d-chip--active"), this.lite);
        this.liteBtn?.setAttribute("aria-pressed", this.lite ? "true" : "false");
        if (this.lite) {
            if (this.graph && this.three) {
                try {
                    this.disposeHulls(this.graph.scene());
                    this.disposeGhosts(this.graph.scene());
                } catch (error) { log.warn("[Graph3D] hull dispose", error); }
            }
            this.clearProximityLabels();
            // A1 (#384): drop the immersive environment for maximum FPS.
            this.disposeStarfield();
            if (this.bloomPass) this.bloomPass.enabled = false;
        } else {
            this.rebuildHulls();
            // A1 (#384): bring the immersive environment back (idempotent + env-gated).
            this.buildEnvironment();
            if (this.bloomPass) this.bloomPass.enabled = true;
            else void this.applyBloom();
        }
        this.wrapperEl?.toggleClass(c("graph3d--immersive"), this.envEnabled());
        this.refreshDecorations(); // re-evaluate non-hub halos for the new Lite state
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

    private addLensChip(group: HTMLElement, kind: OverlayKind, count: number | null): void {
        const chip = group.createEl("button", { cls: c("graph3d-chip") });
        this.labelChip(chip, kind, count);
        chip.setAttribute("aria-pressed", "false");
        this.lensChips.set(kind, chip);
        this.registerDomEvent(chip, "click", () => this.toggleOverlay(kind));
    }

    /**
     * Name a chip and say how much there is of it — the **one** place the zero rule lives, so a
     * count that arrives later (the gap lens, #532) obeys exactly the rule the other six got at
     * build time. A `null` count is a lens that has not been asked yet: no number, and enabled,
     * because "no count" is not "nothing to show".
     */
    private labelChip(chip: HTMLElement, kind: OverlayKind, count: number | null): void {
        const name = t(OVERLAY_SPECS[kind].labelKey as Parameters<typeof t>[0]);
        const label = count === null ? name : `${name} (${count})`;
        chip.setText(label);
        chip.setAttribute("aria-label", label);
        if (count === 0) chip.setAttribute("disabled", "true");
    }

    /**
     * Read the gap projection — the **only** place in this view that does, and only because
     * someone switched the lens on (#532).
     *
     * Every other lens count falls out of `graph3dStats`, which walks the graph the view already
     * built. This one costs the shared gap pass: 982 ms over ten thousand notes. Paying that on a
     * render, for a number nobody asked for, is exactly what #458 exists to prevent — so it is
     * paid here, once per model revision, after a click.
     */
    private ensureGapSource(): void {
        const index = KnowledgeIndex.getInstance();
        if (index.status !== "ready") return;
        const model = index.getModel();
        // Both the model and the record, because a verdict moves one and not the other (#534).
        const judgements = JudgementLog.getInstance().entries();
        const verdicts = judgements.length;
        if (this.gapRevision === model.revision() && this.gapVerdicts === verdicts) return;
        this.gapTotal = openGapCount(model, judgements);
        this.gapStrongest = openGaps(model, judgements, GAP_DRAW_MAX);
        this.gapRevision = model.revision();
        this.gapVerdicts = verdicts;
        const chip = this.lensChips.get("gaps");
        if (chip) this.labelChip(chip, "gaps", this.gapTotal);
    }

    /**
     * Which edges the active lens lights, and the notes they join — or `null` when the lens is
     * about notes. One branch per **kind**, never per lens:
     *
     * - `node` — nothing to do; the predicate runs per node while painting.
     * - `edge` (#526) — the notes joined by the links that match.
     * - `candidate` (#532) — the notes joined by the ghost edges, which are not in the graph at
     *   all: the gap projection is read here (once per revision) and the strongest are selected
     *   against what is on screen.
     *
     * Paint only: nothing here hides, filters or narrows anything, the way framing in #515 moves
     * the camera and nothing else.
     */
    private syncEdgeLens(): void {
        const spec = this.overlay ? OVERLAY_SPECS[this.overlay] : null;
        if (spec?.on === "candidate") {
            this.ensureGapSource();
            const selection = selectGhosts(this.displayed, this.gapStrongest);
            this.ghosts = selection.edges;
            this.edgeLensEndpoints = selection.endpoints;
            return;
        }
        this.ghosts = [];
        if (!spec || spec.on !== "edge") {
            this.edgeLensEndpoints = null;
            return;
        }
        const endpoints = new Set<string>();
        for (const link of this.displayed.links) {
            if (!spec.matches(link)) continue;
            endpoints.add(link.source);
            endpoints.add(link.target);
        }
        this.edgeLensEndpoints = endpoints;
    }

    /** Whether the active lens matches this link — false whenever the lens is about notes. */
    private edgeLensMatches(link: LiveLink): boolean {
        const spec = this.overlay ? OVERLAY_SPECS[this.overlay] : null;
        return !!spec && spec.on === "edge" && spec.matches(link as unknown as Graph3DLink);
    }

    private toggleOverlay(kind: OverlayKind): void {
        this.overlay = this.overlay === kind ? null : kind;
        this.syncEdgeLens();
        // Without `three` the lens still works -- both notes of every gap stay lit -- and only the
        // dashes are missing. Said once per activation, through `log`, and never silently.
        if (this.overlay === "gaps" && !this.three && !this.ghostWarned) {
            this.ghostWarned = true;
            log.warn("[Graph3D] ghost edges unavailable (three); the gap lens lights its notes only");
        }
        // The gap chip is the one that learns its count on being used (#532). If the answer turns
        // out to be none, the activation is dropped rather than dimming the whole graph to light
        // nothing — and `labelChip` has just disabled the chip, so it cannot be asked again.
        if (this.overlay === "gaps" && this.gapTotal === 0) {
            this.overlay = null;
            this.edgeLensEndpoints = null;
            this.ghosts = [];
        }
        for (const [k, el] of this.lensChips) {
            const active = k === this.overlay;
            el.toggleClass(c("graph3d-chip--active"), active);
            el.setAttribute("aria-pressed", active ? "true" : "false");
        }
        this.refreshPaint();
        this.updateStatus();
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
        this.arrivedAt = null; // you have moved on from where you came in

        if (this.pinnedId) this.focusNode(this.pinnedId);
        this.refreshPaint();
        this.updateStatus();
    }

    private clearFocus(): void {
        // A click on the canvas dismisses the options the way a click outside any popover does.
        this.closeSettings();
        this.hoverId = null;
        this.pinnedId = null;
        this.arrivedAt = null;
        this.overlay = null;
        this.edgeLensEndpoints = null;
        this.ghosts = [];
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
        this.arrivedAt = path;
        this.focusNode(path);
        this.updateStatus();
    }

    private focusNode(path: string, durationMs = 1200): void {
        if (!this.graph) return;
        const nodes = (this.graph.graphData() as { nodes: LiveNode[] }).nodes;
        const node = nodes.find((n) => n.id === path);
        if (!node || node.x === undefined) return;
        const x = node.x, y = node.y ?? 0, z = node.z ?? 0;
        const ratio = 1 + 120 / (Math.hypot(x, y, z) || 1);
        this.graph.cameraPosition({ x: x * ratio, y: y * ratio, z: z * ratio }, { x, y, z }, durationMs);
    }

    // ── A2 (#385): the cinematic tour ────────────────────────────────────────────
    private toggleTour(): void {
        if (this.tourActive) this.stopTour();
        else this.startTour();
    }

    /** Begin a cinematic flight through the hubs + most-recent notes (pure {@link tourStops}). */
    private startTour(): void {
        if (!this.graph) return;
        this.tourStopIds = tourStops(this.displayed).map((stop) => stop.id);
        if (this.tourStopIds.length === 0) return; // nothing to fly to (empty graph)
        this.tourActive = true;
        this.tourIndex = 0;
        this.tourBtn?.toggleClass(c("graph3d-chip--active"), true);
        this.tourBtn?.setAttribute("aria-pressed", "true");
        this.tourBtn?.setText(t("graph3d_tour_stop"));
        this.advanceTour();
        this.updateStatus();
    }

    /** Fly to the next stop, then schedule the following one (instant cuts under reduced-motion). */
    private advanceTour(): void {
        if (!this.tourActive || !this.graph || this.tourStopIds.length === 0) return;
        const id = this.tourStopIds[this.tourIndex % this.tourStopIds.length];
        this.focusNode(id, this.reducedMotion ? 0 : 1200);
        this.tourIndex++;
        const dwell = this.reducedMotion ? 500 : 2600;
        window.clearTimeout(this.tourTimer);
        this.tourTimer = window.setTimeout(() => this.advanceTour(), dwell);
    }

    private stopTour(): void {
        if (!this.tourActive && this.tourTimer === undefined) return;
        this.tourActive = false;
        window.clearTimeout(this.tourTimer);
        this.tourTimer = undefined;
        this.tourBtn?.toggleClass(c("graph3d-chip--active"), false);
        this.tourBtn?.setAttribute("aria-pressed", "false");
        this.tourBtn?.setText(t("graph3d_tour_play"));
        this.updateStatus();
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
            const spec = OVERLAY_SPECS[this.overlay];
            // Only a lens about **notes** has a predicate to run. A link lens lights what its
            // edges join (#526) and a candidate lens lights what its ghost edges would join
            // (#532) -- both read the same endpoint set, so the picture reads as *what joins
            // what* rather than as bright lines over an unlit graph. One branch per kind.
            if (spec.on === "node") {
                return spec.matches(node) ? this.varColor(spec.colorVar) : DIM_NODE;
            }
            return this.edgeLensEndpoints?.has(node.id ?? "") ? this.varColor(spec.colorVar) : DIM_NODE;
        }
        if (this.pathNodes) return this.pathNodes.has(node.id ?? "") ? this.baseNodeColor(node) : DIM_NODE;
        if (this.lit && !this.lit.has(node.id ?? "")) return DIM_NODE;
        const focus = this.activeFocus();
        if (focus && !focus.has(node.id ?? "")) return DIM_NODE;
        return this.baseNodeColor(node);
    }

    private baseNodeColor(node: Graph3DNode): string {
        if (this.colorMode === "state") return STATE_COLORS[node.state] ?? DEFAULT_STATE_COLOR;
        return communityColor(node.community);
    }

    private computeLinkColor(link: LiveLink): string {
        if (this.edgeLensEndpoints) {
            const spec = OVERLAY_SPECS[this.overlay as OverlayKind];
            return this.edgeLensMatches(link) ? this.varColor(spec.colorVar) : DIM_LINK;
        }
        if (this.overlay) return DIM_LINK;
        if (this.pathEdges) return this.pathEdges.has(this.edgeKey(endId(link.source), endId(link.target))) ? this.relationColor(link.type) : DIM_LINK;
        if (this.lit && !(this.lit.has(endId(link.source)) && this.lit.has(endId(link.target)))) return DIM_LINK;
        const focus = this.activeFocus();
        if (focus) return focus.has(endId(link.source)) && focus.has(endId(link.target)) ? this.relationColor(link.type) : DIM_LINK;
        return this.relationColor(link.type);
    }

    private computeLinkWidth(link: LiveLink): number {
        // 26 crossings in a graph of hundreds have to be findable, not merely coloured.
        if (this.edgeLensEndpoints) return this.edgeLensMatches(link) ? 4 : 0.4;
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
        const colour = t(this.colorMode === "state" ? "graph3d_color_state" : "graph3d_color_neighbourhood");
        const parts = [`${t("graph3d_group_color")}: ${colour}`, `${this.displayed.nodes.length} ${t("graph3d_status_notes")}`];
        if (this.overlay) parts.push(`${t("graph3d_group_lens")}: ${t(OVERLAY_SPECS[this.overlay].labelKey as Parameters<typeof t>[0])}`);
        // How many gaps there are, and how many of them are on screen (#532). Both numbers, because
        // a bounded view that states only what it drew is the half of the truth that flatters it.
        if (this.overlay === "gaps" && this.gapTotal !== null) {
            parts.push(
                this.ghosts.length === this.gapTotal
                    ? t("graph3d_status_gaps", String(this.gapTotal))
                    : t("graph3d_status_gaps_drawn", String(this.gapTotal), String(this.ghosts.length))
            );
        }
        if (this.pinnedId) {
            const pinned = this.displayed.nodes.find((n) => n.id === this.pinnedId);
            if (pinned) parts.push(`▸ ${pinned.name}`);
        }
        const arrival = this.arrivalFact();
        if (arrival) parts.push(arrival);
        if (this.pathMode) parts.push(t("graph3d_path_mode"));
        if (this.tourActive) parts.push(t("graph3d_status_tour"));
        if (this.timeCursor !== null) parts.push(t("graph3d_status_timelapse"));
        if (this.lite) parts.push(t("graph3d_lite"));
        this.statusEl.setText(parts.join("  ·  "));
    }

    /**
     * Where you landed (#517) — the payoff of naming the regions. Read straight off the node:
     * #513 and #514 already put the name there and made `group < 0` mean alone, so this is a
     * lookup, not a second traversal. Counted from `displayed.nodes`, like the legend, so a capped
     * graph reports what is on screen.
     *
     * Both sentences are facts. A note being alone is a fact; "connect it" would be the surface
     * deciding what you came for (§XII).
     */
    private arrivalFact(): string | null {
        if (!this.arrivedAt) return null;
        const node = this.displayed.nodes.find((candidate) => candidate.id === this.arrivedAt);
        if (!node) return null;
        if (node.community < 0 || !node.communityName) return t("graph3d_status_alone");
        const size = this.displayed.nodes.filter((candidate) => candidate.communityName === node.communityName).length;
        return t("graph3d_status_in_region", node.communityName, String(size), node.region);
    }

    private renderLegend(): void {
        if (!this.wrapperEl) return;
        this.wrapperEl.querySelector("." + c("graph3d-legend"))?.remove();
        const legend = this.wrapperEl.createDiv({ cls: c("graph3d-legend") });

        // Node colour legend — reflects the active mode so the user knows what colours mean.
        legend.createDiv({
            cls: c("graph3d-legend-title"),
            text: t(this.colorMode === "state" ? "graph3d_legend_nodes" : "graph3d_legend_neighbourhoods"),
        });
        if (this.colorMode === "state") {
            const states = [...new Set(this.displayed.nodes.map((n) => n.state).filter((s) => s))].sort();
            for (const stateName of states) {
                const row = legend.createDiv({ cls: c("graph3d-legend-row") });
                const known = STATE_COLOR_VARS[stateName] !== undefined;
                row.createSpan({ cls: known ? c("graph3d-swatch", "graph3d-swatch--state-" + stateName) : c("graph3d-swatch") });
                row.createSpan({ text: stateName });
            }
        } else {
            this.legendRegionRows(legend);
        }

        // Node-kind icons present (question / source).
        const kinds = new Set(this.displayed.nodes.map((n) => n.kind));
        if (kinds.has("question") || kinds.has("source")) {
            legend.createDiv({ cls: c("graph3d-legend-title"), text: t("graph3d_legend_types") });
            if (kinds.has("question")) this.legendKindRow(legend, "question", "?", "graph3d_kind_question");
            if (kinds.has("source")) this.legendKindRow(legend, "source", "◆", "graph3d_kind_source");
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

    /**
     * The neighbourhoods **on screen**, grouped by the region they sit in (#514, #527).
     *
     * It said "By cluster" and stopped there, which is how the largest structures in the view
     * ended up being the only unlabelled ones. #527 moved it a level down: a heading per region,
     * its communities beneath. Counting from `displayed.nodes` rather than from the model means a
     * capped or time-sliced graph reports what you are actually looking at.
     *
     * A region holding exactly one community renders **one row and no heading** — "Region X" above
     * a single "X" is the legend saying the same thing twice.
     */
    private legendRegionRows(legend: HTMLElement): void {
        // Grouped by **community index** since #533 (`neighbourhoodRows`): grouping by name merged
        // two different neighbourhoods that happened to share one, and framing that row flew to
        // both of them at once.
        const { rows, alone } = neighbourhoodRows(this.displayed.nodes);

        const byRegion = new Map<string, NeighbourhoodRow[]>();
        for (const row of rows) {
            const list = byRegion.get(row.region) ?? [];
            list.push(row);
            byRegion.set(row.region, list);
        }
        const regions = [...byRegion].sort(
            (a, b) =>
                b[1].reduce((total, one) => total + one.size, 0) - a[1].reduce((total, one) => total + one.size, 0) ||
                (a[0] < b[0] ? -1 : 1)
        );

        for (const [region, communities] of regions) {
            if (communities.length > 1) this.legendRegionHeading(legend, region);
            for (const one of communities) {
                const row = this.legendRegionRow(legend, one.name, one.size, paletteOf(one.community));
                this.makeFramable(row, communityFrameKey(one.community), () => this.frameCommunity(one.community));
            }
        }
        // Alone is a state, not a neighbourhood: it is listed so the count is visible, and it does
        // not frame, because there is no "there" to fly to.
        if (alone > 0) this.legendRegionRow(legend, t("graph3d_legend_alone"), alone, null);
    }

    /** A region's name over the communities inside it — only when there is more than one (#527). */
    private legendRegionHeading(legend: HTMLElement, region: string): void {
        const row = legend.createDiv({ cls: c("graph3d-legend-region") });
        row.createSpan({ text: region });
        this.makeFramable(row, regionFrameKey(region), () => this.frameWholeRegion(region));
    }

    /** Give a legend row the click, the keyboard and the pressed state that framing needs (#515). */
    private makeFramable(row: HTMLElement, key: string, frame: () => void): void {
        row.addClass(c("graph3d-legend-row--clickable"));
        row.toggleClass(c("graph3d-legend-row--framed"), this.framedKey === key);
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        row.setAttribute("aria-pressed", this.framedKey === key ? "true" : "false");
        this.registerDomEvent(row, "click", () => frame());
        this.registerDomEvent(row, "keydown", (event: KeyboardEvent) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            frame();
        });
    }

    private legendRegionRow(legend: HTMLElement, name: string, size: number, palette: number | null): HTMLElement {
        const row = legend.createDiv({ cls: c("graph3d-legend-row") });
        row.createSpan({
            cls: c("graph3d-swatch", palette === null ? "graph3d-swatch--community-alone" : `graph3d-swatch--community-${palette}`),
        });
        row.createSpan({ text: name });
        row.createSpan({ cls: c("graph3d-legend-count"), text: t("graph3d_legend_region_size", String(size)) });
        return row;
    }

    /**
     * Fly to one region (#515). A **camera move and nothing else** — the graph already has a query,
     * a lens and a time cursor to narrow it with, and a fourth way would be the addition this epic
     * exists to refuse. Clicking the framed region again pulls back to the whole graph.
     */
    private frameCommunity(index: number): void {
        // By index, not by name (#533): two neighbourhoods can share a label, and they are two
        // places. `node.communityName === name` framed both of them.
        this.frameBy(communityFrameKey(index), belongsToCommunity(index));
    }

    /** Fly to a whole region — every community in it — from its legend heading (#527). */
    private frameWholeRegion(region: string): void {
        this.frameBy(regionFrameKey(region), (node) => node.region === region);
    }

    private frameBy(key: string, belongs: (node: Graph3DNode) => boolean): void {
        if (!this.graph) return;
        if (this.framedKey === key) {
            this.framedKey = null;
            this.graph.zoomToFit(700, 40);
        } else {
            this.framedKey = key;
            this.graph.zoomToFit(700, 40, (node) => belongs(node as Graph3DNode));
        }
        this.renderLegend();
    }

    private legendKindRow(legend: HTMLElement, kind: string, glyph: string, labelKey: Parameters<typeof t>[0]): void {
        const row = legend.createDiv({ cls: c("graph3d-legend-row") });
        row.createSpan({ cls: c("graph3d-kind-icon", "graph3d-kind-icon--" + kind), text: glyph });
        row.createSpan({ text: t(labelKey) });
    }

    /** Toggle a relation type's visibility from the legend (click a relation to show only what you want). */
    private toggleRelation(type: string): void {
        if (this.hiddenRelations.has(type)) this.hiddenRelations.delete(type);
        else this.hiddenRelations.add(type);
        this.refreshPaint();
        this.renderLegend();
    }

    /**
     * The mobile / no-WebGL fallback (#319 S2). Rather than a dead-end message, render a **navigable
     * list** of the same model: every note ranked by connectivity (hubs first) with its live connection
     * count and lens flags, each row a keyboard-operable button that opens the note. Mobile users still
     * see the *shape* of their thinking (the hubs float to the top) and can walk it.
     */
    private renderFallback(): void {
        this.teardownGraph();
        this.container.empty();
        const root = this.container.createDiv({ cls: c("graph3d-fallback") });
        root.createDiv({ cls: c("graph3d-fallback-note"), text: t("graph3d_fallback_message") });

        const nodes = [...this.data.nodes].sort(
            (a, b) => (this.connectionCount(b.id) - this.connectionCount(a.id)) || a.name.localeCompare(b.name)
        );
        if (nodes.length === 0) {
            root.createDiv({ cls: c("graph3d-message"), text: t("graph3d_state_empty") });
            return;
        }
        const list = root.createDiv({ cls: c("graph3d-fallback-list") });
        list.setAttribute("role", "list");
        for (const node of nodes) {
            const row = list.createEl("button", { cls: c("graph3d-fallback-row") });
            row.setAttribute("role", "listitem");
            row.setAttribute("aria-label", node.name);
            if (node.orphan) row.createSpan({ cls: c("graph3d-fallback-flag", "graph3d-fallback-flag--orphan"), text: "○", attr: { "aria-hidden": "true" } });
            if (node.contradiction) row.createSpan({ cls: c("graph3d-fallback-flag", "graph3d-fallback-flag--contradiction"), text: "⚡", attr: { "aria-hidden": "true" } });
            row.createSpan({ cls: c("graph3d-fallback-name"), text: node.name });
            row.createSpan({
                cls: c("graph3d-fallback-meta"),
                text: t("graph3d_fallback_connections", String(this.connectionCount(node.id))),
            });
            this.registerDomEvent(row, "click", () => void this.app.workspace.openLinkText(node.id, "", false));
        }
    }

    /** Live neighbour count (both directions) for a node, from the paint adjacency. */
    private connectionCount(id: string): number {
        return this.adjacency.get(id)?.size ?? 0;
    }

    private applySize(): void {
        if (!this.graph) return;
        const el = this.wrapperEl ?? this.container; // in fullscreen the wrapper is the sized element
        this.graph.width(el.clientWidth || 400).height(el.clientHeight || 400);
    }

    private teardownGraph(): void {
        // A3 (#386): stop any in-flight time-lapse recording before the canvas goes away.
        if (this.activeRecorder && this.activeRecorder.state !== "inactive") {
            try { this.activeRecorder.stop(); } catch (error) { log.warn("[Graph3D] recorder stop", error); }
        }
        this.activeRecorder = null;
        // A2 (#385): stop any running cinematic tour.
        window.clearTimeout(this.tourTimer);
        this.tourTimer = undefined;
        this.tourActive = false;
        this.tourStopIds = [];
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.visibilityObserver?.disconnect();
        this.visibilityObserver = null;
        window.clearInterval(this.timelapseTimer);
        this.timelapseTimer = undefined;
        window.clearInterval(this.proximityTimer);
        this.proximityTimer = undefined;
        window.clearInterval(this.hullTimer);
        this.hullTimer = undefined;
        if (this.graph && this.three) {
            try {
                this.clearProximityLabels();
                this.disposeHulls(this.graph.scene());
                this.disposeStarfield();
            } catch (error) {
                log.warn("[Graph3D] error disposing graph decorations", error);
            }
        }
        this.starfield = null;
        this.bloomPass = null; // the pass is destroyed with the graph's composer in _destructor()
        this.spriteTextCtor = null;
        this.glowTexture = null;
        this.three = null;
        this.colorButtons.clear();
        this.lensChips.clear();
        this.timeSlider = null;
        this.playBtn = null;
        this.pathBtn = null;
        this.tourBtn = null;
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
