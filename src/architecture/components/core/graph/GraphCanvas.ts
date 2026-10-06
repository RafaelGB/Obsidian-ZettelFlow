import { Component } from "obsidian";
import { c, log } from "architecture";
import { canvasToPngBlob } from "../export/mediaCapture";
import { createCanvasBackend } from "./canvasBackend";
import {
    clamp,
    defaultCamera,
    dragCamera,
    frameGoal,
    projectPoint,
    stepCamera,
    viewProjection,
    zoomCamera,
    type Camera,
    type CameraGoal,
    type Projected,
} from "./graphCamera";
import type { FrameInput, GraphBackend } from "./graphFrame";
import { createGlBackend } from "./glBackend";
import { allocatePaint, paint, type ColorBy, type EdgeAsk, type PaintBuffers, type PaintState } from "./graphPaint";
import { communityBounds, neighbourhoodOf, type GraphScene } from "./graphScene";
import { communityRgba, cssRgb, parseCssColour, readGraphTheme, type ColourResolver, type GraphTheme } from "./graphTheme";
import { layoutRadius } from "./layoutCore";
import { LayoutRunner } from "./layoutRunner";

/** What the view tells the surface that owns it. Indices are scene indices; `null` is the background. */
export interface GraphCallbacks {
    onHover?(index: number | null): void;
    onClick?(index: number | null, event: PointerEvent): void;
    onOpen?(index: number, event: MouseEvent): void;
    onMenu?(index: number, event: MouseEvent): void;
    /** The layout settled (or a cached one was laid down) — positions are final. */
    onSettled?(): void;
}

export type LabelDensity = "few" | "more";

const GHOST_CAPACITY = 32;
/** How long the camera turns on its own after opening, unless you touch it first. */
const IDLE_SPIN_MS = 20_000;

function prefersReducedMotion(win: Window): boolean {
    try {
        return win.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    } catch {
        return false;
    }
}

/**
 * Turns any CSS colour into channels by painting one pixel (#693): whatever a theme writes —
 * `oklch()`, `color-mix()`, `calc()` inside `hsl()` — the browser resolves, and the graph uses
 * exactly the colour the rest of the workspace shows.
 */
function pixelResolver(): ColourResolver {
    let ctx: CanvasRenderingContext2D | null = null;
    try {
        const canvas = createEl("canvas");
        canvas.width = canvas.height = 1;
        ctx = canvas.getContext("2d", { willReadFrequently: true });
    } catch {
        ctx = null;
    }
    const cache = new Map<string, ReturnType<ColourResolver>>();
    return (css) => {
        if (!css) return null;
        const known = cache.get(css);
        if (known !== undefined) return known;
        let out = parseCssColour(css);
        if (!out && ctx) {
            ctx.fillStyle = "#010203";
            ctx.fillStyle = css;
            if (ctx.fillStyle !== "#010203" || css.trim().toLowerCase() === "#010203") {
                ctx.clearRect(0, 0, 1, 1);
                ctx.fillRect(0, 0, 1, 1);
                const d = ctx.getImageData(0, 0, 1, 1).data;
                out = [d[0] / 255, d[1] / 255, d[2] / 255, d[3] === 0 ? 1 : d[3] / 255];
            }
        }
        cache.set(css, out);
        return out;
    };
}

/**
 * **The graph engine's host** (#693, epic #692): the canvases, the render-on-demand loop, the camera,
 * the pointer, and the labels on one 2D overlay.
 *
 * - It renders **only when something moves**: a camera flight, the layout settling, a fade, light
 *   along a bridge. Idle, it costs nothing, and hidden behind another tab it does not even ask.
 * - The layout runs in slices or in a worker ({@link LayoutRunner}); positions stream in.
 * - Colours come from {@link paint} into typed buffers; the GPU re-reads them only when they change.
 *
 * It knows nothing about Explore: the surface that owns it says what is lit, what is focused and
 * what to frame, and hears back about hovers and clicks.
 */
export class GraphCanvas extends Component {
    private readonly root: HTMLElement;
    private glCanvas: HTMLCanvasElement;
    private readonly overlay: HTMLCanvasElement;
    private overlayCtx: CanvasRenderingContext2D | null = null;
    private backend: GraphBackend | null = null;
    private readonly win: Window;
    private readonly reduced: boolean;
    private theme: GraphTheme;
    private resolver: ColourResolver;
    private width = 1;
    private height = 1;
    private dpr = 1;
    private visible = true;
    private frameRequest: number | null = null;
    private lastFrame = 0;
    private readonly matrix = new Float32Array(16);

    private scene: GraphScene | null = null;
    private positions = new Float32Array(0);
    private positionsVersion = 0;
    private buffers: PaintBuffers | null = null;
    private paintVersion = 0;
    private paintDirty = true;
    private edgeIndex = new Uint32Array(0);
    private edgeVersion = 0;
    private ghostPairs = new Uint32Array(0);
    private nebulae = { centre: new Float32Array(0), radius: new Float32Array(0), color: new Float32Array(0), count: 0, version: 0 };
    private bounds: ReturnType<typeof communityBounds> | null = null;
    private layoutRunning = false;
    private readonly runner: LayoutRunner;

    readonly camera: Camera;
    private goal: CameraGoal | null = null;
    private spinUntil = 0;
    private fade = 0;
    private paintState: PaintState = {
        colorBy: "region",
        lit: null,
        focus: null,
        fade: 0,
        timeCursor: Infinity,
        edgeAsk: null,
        hubs: new Set(),
    };
    private hover: number | null = null;
    /** Notes that carry a ring: the step you are on, the one in the peek card. */
    private readonly marked = new Set<number>();
    private labels: LabelDensity = "more";
    private names: string[] = [];
    private framedOnce = false;
    /** The owner framed something since the scene arrived — the first settle then leaves the camera be. */
    private ownerFramed = false;
    private drag: { x: number; y: number; from: Camera; moved: boolean; pan: boolean } | null = null;
    private readonly pointers = new Map<number, { x: number; y: number }>();
    private pinch: { d: number; dist: number } | null = null;
    private frameMs = 0;

    constructor(parent: HTMLElement, private readonly callbacks: GraphCallbacks = {}) {
        super();
        this.win = parent.win ?? window;
        this.reduced = prefersReducedMotion(this.win);
        this.root = parent.createDiv({ cls: c("graph-canvas") });
        this.glCanvas = this.root.createEl("canvas", { cls: c("graph-canvas-gl") });
        this.overlay = this.root.createEl("canvas", { cls: c("graph-canvas-overlay"), attr: { "aria-hidden": "true" } });
        this.glCanvas.setAttribute("role", "img");
        this.camera = defaultCamera();
        this.resolver = pixelResolver();
        this.theme = this.readTheme();
        this.runner = new LayoutRunner(this.win, (positions, done) => this.onPositions(positions, done));
    }

    onload(): void {
        this.backend = createGlBackend(this.glCanvas);
        if (!this.backend) {
            // A canvas keeps the first kind of context it was asked for: once WebGL2 was tried, a 2D
            // context on the same element is null. The fallback draws on a fresh one.
            this.glCanvas.remove();
            const fresh = this.root.createEl("canvas", { cls: c("graph-canvas-gl"), attr: { role: "img" } });
            // Under the labels, where the first canvas was.
            this.root.insertBefore(fresh, this.overlay);
            this.glCanvas = fresh;
            this.backend = createCanvasBackend(fresh);
        }
        try {
            this.overlayCtx = this.overlay.getContext("2d");
        } catch {
            this.overlayCtx = null;
        }
        if (!this.backend) {
            this.root.addClass(c("graph-canvas--unavailable"));
            log.warn("[Graph] neither WebGL2 nor a 2D canvas is available here");
        }
        this.registerDomEvent(this.glCanvas, "pointerdown", (event) => this.onPointerDown(event));
        this.registerDomEvent(this.glCanvas, "pointermove", (event) => this.onPointerMove(event));
        this.registerDomEvent(this.glCanvas, "pointerup", (event) => this.onPointerUp(event));
        this.registerDomEvent(this.glCanvas, "pointercancel", (event) => this.onPointerUp(event));
        this.registerDomEvent(this.glCanvas, "pointerleave", () => this.setHoverInternal(null));
        this.registerDomEvent(this.glCanvas, "wheel", (event) => this.onWheel(event), { passive: false });
        this.registerDomEvent(this.glCanvas, "dblclick", (event) => {
            const hit = this.pick(event);
            if (hit !== null) this.callbacks.onOpen?.(hit, event);
        });
        this.registerDomEvent(this.glCanvas, "contextmenu", (event) => {
            const hit = this.pick(event);
            if (hit === null) return;
            event.preventDefault();
            this.callbacks.onMenu?.(hit, event);
        });

        const Resize = (this.win as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
        if (Resize) {
            const observer = new Resize(() => this.measure());
            observer.observe(this.root);
            this.register(() => observer.disconnect());
        }
        // Hidden behind another tab or scrolled away: stop asking for frames at all (#302 S4).
        const Intersection = (this.win as unknown as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;
        if (Intersection) {
            const observer = new Intersection((entries) => {
                this.visible = entries.some((entry) => entry.isIntersecting);
                if (this.visible) this.request();
            });
            observer.observe(this.root);
            this.register(() => observer.disconnect());
        }
        this.measure();
        if (!this.reduced) this.spinUntil = performance.now() + IDLE_SPIN_MS;
    }

    onunload(): void {
        this.runner.dispose();
        if (this.frameRequest !== null) this.win.cancelAnimationFrame(this.frameRequest);
        this.frameRequest = null;
        this.backend?.dispose();
        this.backend = null;
        this.root.remove();
    }

    // ── what the owner tells it ─────────────────────────────────────────────────

    /** Which renderer is drawing — WebGL2, the 2D canvas, or none (the owner shows a list). */
    get kind(): GraphBackend["kind"] | null {
        return this.backend?.kind ?? null;
    }

    /** The scene being drawn. */
    get current(): GraphScene | null {
        return this.scene;
    }

    /** Where the layout runs: a worker, or slices of the main thread when none could start (#694). */
    get layoutThread(): "worker" | "main" {
        return this.runner.where;
    }

    get drawCalls(): number {
        return this.backend?.drawCalls ?? 0;
    }

    get lastFrameMs(): number {
        return this.frameMs;
    }

    /** The positions as laid out — a reference, never to be mutated by the caller. */
    get layoutPositions(): Float32Array {
        return this.positions;
    }

    /**
     * Draw `scene`. `initial`/`alpha` let the owner start from a known layout (#694); otherwise the
     * community seed lays it out from scratch.
     */
    setScene(scene: GraphScene, initial?: Float32Array, alpha?: number): void {
        this.scene = scene;
        this.buffers = allocatePaint(scene, GHOST_CAPACITY);
        this.ghostPairs = new Uint32Array(0);
        this.rebuildEdgeIndex();
        this.names = scene.communities.map((community) => community.name);
        this.paintState = { ...this.paintState, hubs: new Set(scene.hubs.slice(0, 14)) };
        this.hover = null;
        this.marked.clear();
        this.positions = initial && initial.length === scene.n * 3 ? initial.slice() : new Float32Array(scene.n * 3);
        this.positionsVersion++;
        this.paintDirty = true;
        this.ownerFramed = false;
        const settledAlready = initial !== undefined && alpha !== undefined && alpha <= 0;
        if (settledAlready) {
            this.layoutRunning = false;
            this.updateBounds();
            this.settled(true);
        } else {
            this.layoutRunning = true;
            this.runner.start({
                n: scene.n,
                edges: scene.edges,
                community: scene.community,
                communityCount: scene.communities.length,
                initial,
                alpha,
            });
        }
        if (!this.framedOnce) {
            this.camera.dist = layoutRadius(scene.n) * 2.6;
            this.framedOnce = true;
        }
        this.request();
    }

    /** What a region is called, by palette slot — the hub's name or the one you gave it (#697). */
    setRegionNames(names: string[]): void {
        this.names = names;
        this.request();
    }

    setLit(lit: ReadonlySet<number> | null): void {
        this.paintState = { ...this.paintState, lit };
        this.paintDirty = true;
        this.request();
    }

    /** Focus a note and its neighbours (a click), or `null` to let go. */
    setFocus(index: number | null): void {
        const focus = index === null || !this.scene ? null : neighbourhoodOf(this.scene, index);
        this.paintState = { ...this.paintState, focus };
        this.paintDirty = true;
        this.request();
    }

    get focused(): boolean {
        return this.paintState.focus !== null;
    }

    setColorBy(colorBy: ColorBy): void {
        this.paintState = { ...this.paintState, colorBy };
        this.paintDirty = true;
        this.updateNebulaColours();
        this.request();
    }

    get colorBy(): ColorBy {
        return this.paintState.colorBy;
    }

    setEdgeAsk(edgeAsk: EdgeAsk): void {
        this.paintState = { ...this.paintState, edgeAsk };
        this.paintDirty = true;
        this.request();
    }

    /** The moment the vault is shown at (#697): notes made after it are not there yet. */
    setTime(cursor: number): void {
        this.paintState = { ...this.paintState, timeCursor: cursor };
        this.paintDirty = true;
        this.request();
    }

    /** Candidate pairs drawn as dashed ghosts (#532): scene indices, two per pair. */
    setGhosts(pairs: Uint32Array): void {
        this.ghostPairs = pairs.slice(0, Math.min(pairs.length, GHOST_CAPACITY * 2));
        this.rebuildEdgeIndex();
        this.paintDirty = true;
        this.request();
    }

    setLabels(density: LabelDensity): void {
        this.labels = density;
        this.request();
    }

    get labelDensity(): LabelDensity {
        return this.labels;
    }

    /** Ring these notes (the step you are on, the note in the peek card). */
    setMarked(indices: Iterable<number>): void {
        this.marked.clear();
        for (const i of indices) this.marked.add(i);
        this.request();
    }

    setFlat(flat: boolean): void {
        if (this.camera.flat === flat) return;
        this.camera.flat = flat;
        this.goal = null;
        this.spinUntil = 0;
        this.frameAll(true);
    }

    get flat(): boolean {
        return this.camera.flat;
    }

    /** The theme changed (`css-change`): read every colour again. */
    refreshTheme(): void {
        this.resolver = pixelResolver();
        this.theme = this.readTheme();
        this.paintDirty = true;
        this.updateNebulaColours();
        this.request();
    }

    /** Fly to frame these notes — the camera moves; nothing is hidden (#515, #696). */
    frame(indices: Iterable<number>, opts: { min?: number; shift?: number; instant?: boolean } = {}): void {
        const points: number[] = [];
        let count = 0;
        for (const i of indices) {
            if (!this.scene || i < 0 || i >= this.scene.n) continue;
            points.push(this.positions[i * 3], this.positions[i * 3 + 1], this.positions[i * 3 + 2]);
            count++;
        }
        const goal = frameGoal(this.camera, points, count, opts);
        if (!goal) return;
        this.ownerFramed = true;
        this.spinUntil = 0;
        if (opts.instant || this.reduced) {
            stepCamera(this.camera, goal, 1e6, true);
            this.goal = null;
        } else {
            this.goal = goal;
        }
        this.request();
    }

    frameAll(instant = false): void {
        if (!this.scene) return;
        const all: number[] = [];
        for (let i = 0; i < this.scene.n; i++) all.push(i);
        this.frame(all, { min: 300, instant });
    }

    /** Where a note is on screen right now, for the peek card (#697). */
    screenOf(index: number): Projected | null {
        if (!this.scene || index < 0 || index >= this.scene.n) return null;
        viewProjection(this.camera, this.width, this.height, this.matrix);
        return projectPoint(this.matrix, this.camera, this.positions[index * 3], this.positions[index * 3 + 1], this.positions[index * 3 + 2], this.width, this.height);
    }

    get size(): { width: number; height: number } {
        return { width: this.width, height: this.height };
    }

    /**
     * The view as a PNG — the graph and its labels — rendered in this very task, so the WebGL buffer
     * is read before the browser clears it (#386).
     */
    async capture(): Promise<Blob | null> {
        if (!this.backend) return null;
        this.renderNow(performance.now());
        const out = createEl("canvas");
        out.width = this.glCanvas.width;
        out.height = this.glCanvas.height;
        const ctx = out.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(this.glCanvas, 0, 0);
        ctx.drawImage(this.overlay, 0, 0);
        try {
            return await canvasToPngBlob(out);
        } catch (error) {
            log.error("[Graph] image export failed", error);
            return null;
        }
    }

    /** The canvas a clip is recorded from (#386). */
    get recordingCanvas(): HTMLCanvasElement {
        return this.glCanvas;
    }

    /** Stop turning on its own — any interaction does it, and so can the owner. */
    stopSpin(): void {
        this.spinUntil = 0;
    }

    // ── the frame loop ──────────────────────────────────────────────────────────

    /** Ask for a frame — at most one is ever pending, and none while the view is hidden. */
    request(): void {
        if (this.frameRequest !== null || !this.visible || !this.backend) return;
        this.frameRequest = this.win.requestAnimationFrame((now) => {
            this.frameRequest = null;
            this.tick(now);
        });
    }

    private tick(now: number): void {
        const dt = this.lastFrame ? clamp(now - this.lastFrame, 0, 64) : 16;
        this.lastFrame = now;
        let moving = false;
        if (this.goal) {
            this.goal = stepCamera(this.camera, this.goal, dt, this.reduced);
            moving = true;
        }
        if (this.spinUntil > now && !this.camera.flat && !this.drag) {
            this.camera.yaw += dt * 0.00005;
            moving = true;
        }
        const want = this.paintState.focus || this.paintState.lit ? 1 : 0;
        if (Math.abs(this.fade - want) > 0.002) {
            this.fade += (want - this.fade) * (this.reduced ? 1 : Math.min(1, dt / 160));
            this.paintDirty = true;
            moving = true;
        } else if (this.fade !== want) {
            this.fade = want;
            this.paintDirty = true;
        }
        if (this.layoutRunning) moving = true;
        if (this.paintState.edgeAsk === "bridges" && !this.reduced) moving = true;
        this.renderNow(now);
        if (moving) this.request();
    }

    private renderNow(now: number): void {
        const scene = this.scene;
        const backend = this.backend;
        if (!backend) return;
        const started = performance.now();
        if (scene && this.buffers && this.paintDirty) {
            paint(scene, this.theme, { ...this.paintState, fade: this.fade }, this.buffers, this.ghostPairs);
            this.paintVersion++;
            this.paintDirty = false;
            this.updateNebulaColours();
        }
        viewProjection(this.camera, this.width, this.height, this.matrix);
        const frame: FrameInput = {
            width: this.width,
            height: this.height,
            dpr: this.dpr,
            camera: this.camera,
            matrix: this.matrix,
            theme: this.theme,
            n: scene && this.buffers ? scene.n : 0,
            positions: this.positions,
            positionsVersion: this.positionsVersion,
            paint: this.buffers ?? allocateEmpty(),
            paintVersion: this.paintVersion,
            edgeIndex: scene ? this.edgeIndex : new Uint32Array(0),
            edgeVersion: this.edgeVersion,
            nebulae: this.nebulae,
            stars: this.theme.dark,
            time: now,
        };
        try {
            backend.render(frame);
        } catch (error) {
            log.error("[Graph] a frame failed to draw", error);
        }
        this.drawOverlay();
        this.frameMs = performance.now() - started;
    }

    // ── layout ──────────────────────────────────────────────────────────────────

    private onPositions(positions: Float32Array, done: boolean): void {
        if (!this.scene || positions.length !== this.scene.n * 3) return;
        this.positions.set(positions);
        this.positionsVersion++;
        this.updateBounds();
        if (done) {
            this.layoutRunning = false;
            this.settled(false);
        }
        this.request();
    }

    /** Positions are final: the owner frames what it wants, and otherwise the whole graph comes into view. */
    private settled(instant: boolean): void {
        this.callbacks.onSettled?.();
        if (!this.ownerFramed) this.frameAll(instant);
    }

    private updateBounds(): void {
        if (!this.scene) return;
        this.bounds = communityBounds(this.scene, this.positions);
        const k = this.scene.communities.length;
        if (this.nebulae.centre.length !== k * 3) {
            this.nebulae = { centre: new Float32Array(k * 3), radius: new Float32Array(k), color: new Float32Array(k * 4), count: k, version: 0 };
        }
        this.nebulae.centre.set(this.bounds.cx);
        for (let i = 0; i < k; i++) {
            // A community of one or two is a pair of notes, not a place: no weather around it.
            this.nebulae.radius[i] = this.bounds.size[i] >= 3 ? this.bounds.spread[i] * 2.3 : 0;
        }
        this.updateNebulaColours();
    }

    private updateNebulaColours(): void {
        const scene = this.scene;
        if (!scene || this.nebulae.count === 0) return;
        const lit = this.paintState.focus ?? this.paintState.lit;
        const share = new Uint32Array(this.nebulae.count);
        if (lit) for (const i of lit) if (scene.community[i] >= 0) share[scene.community[i]]++;
        const k = this.fade;
        const base = (this.theme.dark ? 0.2 : 0.11) * (this.paintState.colorBy === "region" ? 1 : 0.6);
        for (let i = 0; i < this.nebulae.count; i++) {
            const colour = communityRgba(this.theme, i);
            const dim = lit ? (share[i] > 0 ? 0.55 + 0.45 * k : 1 - 0.75 * k) : 1;
            this.nebulae.color[i * 4] = colour[0];
            this.nebulae.color[i * 4 + 1] = colour[1];
            this.nebulae.color[i * 4 + 2] = colour[2];
            this.nebulae.color[i * 4 + 3] = base * dim;
        }
        this.nebulae.version++;
    }

    private rebuildEdgeIndex(): void {
        const links = this.scene?.edges ?? new Uint32Array(0);
        const out = new Uint32Array(links.length + this.ghostPairs.length);
        out.set(links, 0);
        out.set(this.ghostPairs, links.length);
        this.edgeIndex = out;
        this.edgeVersion++;
    }

    // ── theme and size ──────────────────────────────────────────────────────────

    private readTheme(): GraphTheme {
        const style = this.win.getComputedStyle?.(this.root);
        return readGraphTheme((name) => style?.getPropertyValue(name) ?? "", this.resolver);
    }

    private measure(): void {
        const rect = this.root.getBoundingClientRect();
        this.width = Math.max(1, rect.width);
        this.height = Math.max(1, rect.height);
        this.dpr = Math.min(2, this.win.devicePixelRatio || 1);
        this.backend?.resize(this.width, this.height, this.dpr);
        const w = Math.max(1, Math.round(this.width * this.dpr));
        const h = Math.max(1, Math.round(this.height * this.dpr));
        if (this.overlay.width !== w) this.overlay.width = w;
        if (this.overlay.height !== h) this.overlay.height = h;
        this.request();
    }

    // ── the overlay: rings, labels and region names ─────────────────────────────

    private drawOverlay(): void {
        const ctx = this.overlayCtx;
        const scene = this.scene;
        if (!ctx) return;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.width, this.height);
        if (!scene || !this.buffers) return;
        const font = this.win.getComputedStyle?.(this.root).fontFamily || "sans-serif";
        const project = (i: number): Projected | null =>
            this.buffers && this.buffers.nodeColor[i * 4 + 3] > 0.004
                ? projectPoint(this.matrix, this.camera, this.positions[i * 3], this.positions[i * 3 + 1], this.positions[i * 3 + 2], this.width, this.height)
                : null;
        const radius = (i: number, p: Projected) =>
            (this.buffers?.nodeSize[i] ?? 3) * (this.camera.flat ? clamp(p.scale * 1.05, 0.55, 1.5) : clamp(p.scale * 1.15, 0.45, 1.7));

        // Rings: hover, and what the owner marked.
        const ringed = new Set<number>(this.marked);
        if (this.hover !== null) ringed.add(this.hover);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = cssRgb(this.theme.text, 0.85);
        for (const i of ringed) {
            const p = project(i);
            if (!p) continue;
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius(i, p) + 5, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Labels: what you point at, what you marked, then the answer's best connected, else the hubs.
        const lit = this.paintState.focus ?? this.paintState.lit;
        const candidates: number[] = [];
        if (this.hover !== null) candidates.push(this.hover);
        for (const i of this.marked) candidates.push(i);
        const budget = this.labels === "more" ? 16 : 7;
        if (lit) {
            const ranked = [...lit].sort((a, b) => scene.degree[b] - scene.degree[a]).slice(0, budget);
            candidates.push(...ranked);
        } else {
            candidates.push(...scene.hubs.slice(0, this.labels === "more" ? 14 : 6));
        }
        ctx.font = `500 11.5px ${font}`;
        ctx.textBaseline = "middle";
        const placed: [number, number, number, number][] = [];
        const seen = new Set<number>();
        for (const i of candidates) {
            if (seen.has(i)) continue;
            seen.add(i);
            const p = project(i);
            if (!p) continue;
            const name = scene.names[i];
            const text = name.length > 34 ? `${name.slice(0, 33)}…` : name;
            const w = ctx.measureText(text).width + 12;
            const h = 19;
            const x = p.x - w / 2;
            const y = p.y - radius(i, p) - 16;
            if (x < 4 || x + w > this.width - 4 || y < 4 || y + h > this.height - 4) continue;
            if (placed.some((q) => x < q[0] + q[2] && x + w > q[0] && y < q[1] + q[3] && y + h > q[1])) continue;
            placed.push([x, y, w, h]);
            const strong = i === this.hover || this.marked.has(i);
            ctx.fillStyle = cssRgb(this.theme.panel, strong ? 0.95 : 0.74);
            roundRect(ctx, x, y, w, h, 9);
            ctx.fill();
            ctx.fillStyle = cssRgb(strong ? this.theme.text : this.theme.muted, 1);
            ctx.fillText(text, x + 6, y + h / 2 + 0.5);
        }

        // Region names, when nothing is asked and the view is wide enough to need them.
        if (!lit && this.bounds) {
            ctx.font = `600 10.5px ${font}`;
            ctx.textAlign = "center";
            const regionPlaced: [number, number, number, number][] = [];
            const order = scene.communities.map((_, i) => i).filter((i) => this.nebulae.radius[i] > 0);
            for (const ci of order) {
                const p = projectPoint(
                    this.matrix,
                    this.camera,
                    this.bounds.cx[ci * 3],
                    this.bounds.cx[ci * 3 + 1] + (this.camera.flat ? 0 : this.bounds.spread[ci] * 1.6),
                    this.bounds.cx[ci * 3 + 2] - (this.camera.flat ? this.bounds.spread[ci] * 1.7 : 0),
                    this.width,
                    this.height
                );
                if (!p) continue;
                const span = this.bounds.spread[ci] * p.scale;
                if (span > Math.min(this.width, this.height) * 0.3) continue;
                const text = (this.names[ci] ?? "").toUpperCase();
                if (!text) continue;
                const w = ctx.measureText(text).width + 8;
                const box: [number, number, number, number] = [p.x - w / 2, p.y - 8, w, 16];
                if (box[0] < 2 || box[0] + w > this.width - 2 || box[1] < 2) continue;
                if (regionPlaced.some((q) => box[0] < q[0] + q[2] && box[0] + w > q[0] && box[1] < q[1] + q[3] && box[1] + 16 > q[1])) continue;
                regionPlaced.push(box);
                ctx.fillStyle = cssRgb(communityRgba(this.theme, ci), 0.9);
                ctx.fillText(text, p.x, p.y);
            }
            ctx.textAlign = "start";
        }
    }

    // ── the pointer ─────────────────────────────────────────────────────────────

    /** The note under the pointer — the nearest within reach, and only what is lit while an answer is up. */
    pick(event: { clientX: number; clientY: number }): number | null {
        const scene = this.scene;
        if (!scene || !this.buffers) return null;
        const rect = this.glCanvas.getBoundingClientRect();
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;
        viewProjection(this.camera, this.width, this.height, this.matrix);
        const restrict = this.paintState.focus === null && this.paintState.lit !== null && this.fade > 0.5 ? this.paintState.lit : null;
        let best: number | null = null;
        let bestD = 14;
        for (let i = 0; i < scene.n; i++) {
            if (this.buffers.nodeColor[i * 4 + 3] < 0.004) continue;
            if (restrict && !restrict.has(i)) continue;
            const p = projectPoint(this.matrix, this.camera, this.positions[i * 3], this.positions[i * 3 + 1], this.positions[i * 3 + 2], this.width, this.height);
            if (!p) continue;
            const d = Math.hypot(p.x - mx, p.y - my) - Math.sqrt(scene.degree[i]);
            if (d < bestD) {
                bestD = d;
                best = i;
            }
        }
        return best;
    }

    private setHoverInternal(index: number | null): void {
        if (index === this.hover) return;
        this.hover = index;
        this.glCanvas.toggleClass(c("graph-canvas-gl--pointing"), index !== null);
        this.callbacks.onHover?.(index);
        this.request();
    }

    private onPointerDown(event: PointerEvent): void {
        this.glCanvas.setPointerCapture?.(event.pointerId);
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        this.spinUntil = 0;
        this.goal = null;
        if (this.pointers.size === 2) {
            const [a, b] = [...this.pointers.values()];
            this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: this.camera.dist };
            this.drag = null;
            return;
        }
        this.drag = { x: event.clientX, y: event.clientY, from: { ...this.camera }, moved: false, pan: event.shiftKey || event.button === 1 };
    }

    private onPointerMove(event: PointerEvent): void {
        if (this.pointers.has(event.pointerId)) this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.pinch && this.pointers.size === 2) {
            const [a, b] = [...this.pointers.values()];
            const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
            this.camera.dist = this.pinch.dist;
            zoomCamera(this.camera, this.pinch.d / d, this.maxDist());
            this.request();
            return;
        }
        if (this.drag) {
            const dx = event.clientX - this.drag.x;
            const dy = event.clientY - this.drag.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true;
            if (this.drag.moved) {
                dragCamera(this.camera, this.drag.from, dx, dy, this.drag.pan);
                this.glCanvas.addClass(c("graph-canvas-gl--dragging"));
                this.request();
            }
            return;
        }
        this.setHoverInternal(this.pick(event));
    }

    private onPointerUp(event: PointerEvent): void {
        this.pointers.delete(event.pointerId);
        if (this.pointers.size < 2) this.pinch = null;
        this.glCanvas.removeClass(c("graph-canvas-gl--dragging"));
        const drag = this.drag;
        this.drag = null;
        if (drag && !drag.moved && event.type === "pointerup" && event.button !== 2) {
            this.callbacks.onClick?.(this.pick(event), event);
        }
    }

    private onWheel(event: WheelEvent): void {
        event.preventDefault();
        this.goal = null;
        this.spinUntil = 0;
        zoomCamera(this.camera, Math.exp(event.deltaY * 0.0012), this.maxDist());
        this.request();
    }

    private maxDist(): number {
        return layoutRadius(this.scene?.n ?? 100) * 9;
    }
}

function allocateEmpty(): PaintBuffers {
    return {
        nodeColor: new Float32Array(0),
        nodeSize: new Float32Array(0),
        nodeGlow: new Float32Array(0),
        edgeColor: new Float32Array(0),
        edgeWidth: new Float32Array(0),
        edgeFlags: new Float32Array(0),
        ghosts: 0,
    };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}
