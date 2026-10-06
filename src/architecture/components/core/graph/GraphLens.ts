import { App, Menu, setIcon } from "obsidian";
import { c, log } from "architecture";
import { t, tCount } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import { build3DGraph, tourStops, type Graph3DData } from "architecture/knowledge/state";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import { hoverPreview } from "architecture/components/core/a11y";
import { buildExportBaseName } from "../export/exportFilename";
import { ExportShareModal } from "../export/ExportShareModal";
import { GraphCanvas } from "./GraphCanvas";
import { consumeGraph3DFocus } from "./graphFocus";
import { buildScene, indicesOf, neighbourhoodOf, type GraphScene } from "./graphScene";
import { layoutKey, recallLayout, rememberLayout, warmStart } from "./layoutCache";

const DEBOUNCE_MS = 700;
const TOUR_STOP_MS = 2600;

type ViewState = "indexing" | "ready" | "empty" | "error";

/**
 * **The graph** (#693, epic #692) — your whole vault drawn by {@link GraphCanvas}, with what Explore
 * selected lit and the rest dimmed (#484).
 *
 * Read-only: a click focuses a note and its neighbours, a double click opens it, and nothing here
 * ever writes. When the device can draw neither WebGL2 nor a 2D canvas, it is a navigable list of the
 * same notes, hubs first — never a blank view (#319 S2).
 */
export class GraphLens extends KnowledgeModeRenderer {
    private state: ViewState = "indexing";
    private scene: GraphScene | null = null;
    private data: Graph3DData = { nodes: [], links: [] };
    private canvas: GraphCanvas | null = null;
    private statusEl: HTMLElement | null = null;
    private bodyEl: HTMLElement | null = null;
    private lastRevision = -1;
    private debounceTimer: number | undefined;
    private pendingFocus: string | null = null;
    private focusIndex: number | null = null;
    private tourTimer: number | undefined;
    private tourStops: number[] = [];
    /** The key of the layout on screen, remembered when it settles so reopening is instant (#694). */
    private layoutKey = "";

    constructor(container: HTMLElement, private readonly app: App, private lit: ReadonlySet<string> | null = null) {
        super(container);
    }

    /** Re-light without rebuilding: the selection changed, the graph and its layout did not. */
    setLit(lit: ReadonlySet<string> | null): void {
        this.lit = lit;
        if (this.canvas && this.scene) this.canvas.setLit(lit ? indicesOf(this.scene, lit) : null);
    }

    onload(): void {
        this.pendingFocus = consumeGraph3DFocus();
        const debounced = () => {
            window.clearTimeout(this.debounceTimer);
            this.debounceTimer = window.setTimeout(() => this.recompute(), DEBOUNCE_MS);
        };
        this.registerEvent(this.app.metadataCache.on("resolved", debounced));
        this.registerEvent(this.app.vault.on("rename", debounced));
        this.registerEvent(this.app.vault.on("delete", debounced));
        // The user's theme wins (§XV) — including when they change it with the graph open.
        this.registerEvent(this.app.workspace.on("css-change", () => this.canvas?.refreshTheme()));
        this.recompute();
    }

    onunload(): void {
        window.clearTimeout(this.debounceTimer);
        this.stopTour();
        this.container.empty();
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
            // `resolved` fires far more often than the graph changes (#302 S4): skip an unchanged model.
            const revision = model.revision();
            if (this.canvas && this.state === "ready" && revision === this.lastRevision) return;
            this.lastRevision = revision;
            this.data = build3DGraph(model);
            const scene = buildScene(this.data);
            this.scene = scene;
            this.state = scene.n === 0 ? "empty" : "ready";
            this.render();
        } catch (error) {
            log.error("[Graph] failed to compute the graph", error);
            this.state = "error";
            this.render();
        }
    }

    private render(): void {
        if (this.state !== "ready" || !this.scene) {
            this.teardown();
            this.container.empty();
            const key = this.state === "indexing" ? "graph_state_indexing" : this.state === "empty" ? "graph_state_empty" : "graph_state_error";
            this.container.createDiv({ cls: c("graph-message"), text: t(key) });
            return;
        }
        if (!this.canvas) this.mount();
        const canvas = this.canvas;
        if (!canvas) return;
        if (!canvas.kind) {
            this.renderFallback(this.scene);
            return;
        }
        // Where the notes were (#694): the same graph comes back exactly where it was, a changed one
        // starts from there and only settles the difference.
        this.layoutKey = layoutKey(this.scene);
        const known = recallLayout(this.layoutKey);
        if (known) {
            canvas.setScene(this.scene, known, 0);
        } else {
            const start = warmStart(this.scene);
            canvas.setScene(this.scene, start.initial, start.alpha);
        }
        canvas.setLit(this.lit ? indicesOf(this.scene, this.lit) : null);
        this.focusIndex = null;
        if (this.pendingFocus) {
            const at = this.scene.index.get(this.pendingFocus);
            if (at !== undefined) {
                this.focusIndex = at;
                canvas.setFocus(at);
                canvas.setMarked([at]);
            }
        }
        this.updateStatus();
    }

    private mount(): void {
        this.container.empty();
        const root = this.container.createDiv({ cls: c("graph-lens") });
        this.bodyEl = root.createDiv({ cls: c("graph-lens-body") });
        const canvas = new GraphCanvas(this.bodyEl, {
            onClick: (index) => this.onClick(index),
            onOpen: (index, event) => this.open(index, event.ctrlKey || event.metaKey),
            onMenu: (index, event) => this.openNodeMenu(index, event),
            onSettled: () => this.onSettled(),
        });
        this.canvas = canvas;
        this.addChild(canvas);

        const tools = root.createDiv({ cls: c("graph-lens-tools") });
        const fit = tools.createEl("button", { cls: "clickable-icon", attr: { "aria-label": t("graph_fit"), type: "button" } });
        setIcon(fit, "maximize");
        this.registerDomEvent(fit, "click", () => canvas.frameAll());
        const more = tools.createEl("button", {
            cls: "clickable-icon",
            attr: { "aria-label": t("graph_more"), "aria-haspopup": "menu", type: "button" },
        });
        setIcon(more, "more-horizontal");
        this.registerDomEvent(more, "click", () => this.openOptions(more));

        this.statusEl = root.createDiv({ cls: c("graph-lens-status"), attr: { "aria-live": "polite" } });
        // Any direct interaction ends a tour (#385).
        this.registerDomEvent(this.bodyEl, "pointerdown", () => this.stopTour());
        this.registerDomEvent(this.bodyEl, "wheel", () => this.stopTour(), { passive: true });
    }

    private teardown(): void {
        this.stopTour();
        if (this.canvas) {
            this.removeChild(this.canvas);
            this.canvas = null;
        }
        this.statusEl = null;
        this.bodyEl = null;
    }

    private onSettled(): void {
        const canvas = this.canvas;
        const scene = this.scene;
        if (!canvas || !scene) return;
        rememberLayout(this.layoutKey, scene, canvas.layoutPositions);
        if (this.pendingFocus && this.focusIndex !== null) {
            canvas.frame(neighbourhoodOf(scene, this.focusIndex), { min: 420 });
            this.pendingFocus = null;
        } else if (this.lit && this.lit.size > 0) {
            canvas.frame(indicesOf(scene, this.lit));
        }
    }

    private onClick(index: number | null): void {
        const canvas = this.canvas;
        const scene = this.scene;
        if (!canvas || !scene) return;
        if (index === null || index === this.focusIndex) {
            this.focusIndex = null;
            canvas.setFocus(null);
            canvas.setMarked([]);
            return;
        }
        this.focusIndex = index;
        canvas.setFocus(index);
        canvas.setMarked([index]);
        canvas.frame(neighbourhoodOf(scene, index), { min: 420 });
    }

    private open(index: number, newTab = false): void {
        const path = this.scene?.ids[index];
        if (path) void this.app.workspace.openLinkText(path, "", newTab ? "tab" : false);
    }

    private openNodeMenu(index: number, event: MouseEvent): void {
        const menu = new Menu();
        menu.addItem((item) => item.setTitle(t("graph_menu_open")).setIcon("file").onClick(() => this.open(index)));
        menu.addItem((item) => item.setTitle(t("graph_menu_open_tab")).setIcon("file-plus").onClick(() => this.open(index, true)));
        menu.addItem((item) => item.setTitle(t("graph_menu_focus")).setIcon("focus").onClick(() => this.onClick(index)));
        menu.showAtMouseEvent(event);
    }

    private openOptions(anchor: HTMLElement): void {
        const canvas = this.canvas;
        if (!canvas) return;
        const menu = new Menu();
        menu.addItem((item) =>
            item.setTitle(t("graph_color_region")).setChecked(canvas.colorBy === "region").onClick(() => canvas.setColorBy("region"))
        );
        menu.addItem((item) =>
            item.setTitle(t("graph_color_state")).setChecked(canvas.colorBy === "state").onClick(() => canvas.setColorBy("state"))
        );
        menu.addSeparator();
        menu.addItem((item) => item.setTitle(t("graph_view_3d")).setChecked(!canvas.flat).onClick(() => canvas.setFlat(false)));
        menu.addItem((item) => item.setTitle(t("graph_view_flat")).setChecked(canvas.flat).onClick(() => canvas.setFlat(true)));
        menu.addSeparator();
        menu.addItem((item) =>
            item.setTitle(t("graph_labels_more")).setChecked(canvas.labelDensity === "more").onClick(() => canvas.setLabels("more"))
        );
        menu.addItem((item) =>
            item.setTitle(t("graph_labels_few")).setChecked(canvas.labelDensity === "few").onClick(() => canvas.setLabels("few"))
        );
        menu.addSeparator();
        menu.addItem((item) =>
            item
                .setTitle(this.tourTimer === undefined ? t("graph_tour_start") : t("graph_tour_stop"))
                .setIcon("route")
                .onClick(() => (this.tourTimer === undefined ? this.startTour() : this.stopTour()))
        );
        menu.addItem((item) => item.setTitle(t("graph_export_image")).setIcon("image").onClick(() => void this.exportImage()));
        // Where the control is, not where the pointer last was — it opens from the keyboard too (#577).
        const rect = anchor.getBoundingClientRect();
        menu.showAtPosition({ x: rect.right, y: rect.bottom });
    }

    /** A flight through the hubs and the newest notes, from the pure {@link tourStops} (#385). */
    private startTour(): void {
        const scene = this.scene;
        const canvas = this.canvas;
        if (!scene || !canvas) return;
        this.tourStops = tourStops(this.data)
            .map((stop) => scene.index.get(stop.id))
            .filter((i): i is number => i !== undefined);
        if (this.tourStops.length === 0) return;
        canvas.stopSpin();
        let at = 0;
        const go = () => {
            if (at >= this.tourStops.length) {
                this.stopTour();
                canvas.frameAll();
                return;
            }
            const stop = this.tourStops[at++];
            canvas.setMarked([stop]);
            canvas.frame(neighbourhoodOf(scene, stop), { min: 380 });
            this.tourTimer = window.setTimeout(go, TOUR_STOP_MS);
        };
        go();
    }

    private stopTour(): void {
        if (this.tourTimer === undefined) return;
        window.clearTimeout(this.tourTimer);
        this.tourTimer = undefined;
        this.canvas?.setMarked(this.focusIndex === null ? [] : [this.focusIndex]);
    }

    /** Frame everything, then capture the view — graph and labels — and offer it to save (#386). */
    private async exportImage(): Promise<void> {
        const canvas = this.canvas;
        if (!canvas) return;
        canvas.frameAll(true);
        const blob = await canvas.capture();
        if (!blob) return;
        new ExportShareModal(this.app, { blob, baseName: buildExportBaseName("universe", new Date()), kind: "image" }).open();
    }

    private updateStatus(): void {
        const scene = this.scene;
        if (!this.statusEl || !scene) return;
        this.statusEl.setText(
            `${tCount(scene.n, "graph_status_notes", String(scene.n))} · ${tCount(scene.linkCount, "graph_status_links", String(scene.linkCount))}`
        );
        this.canvas?.recordingCanvas.setAttribute("aria-label", t("graph_aria", String(scene.n)));
    }

    /**
     * No renderer at all (#319 S2): the same notes as a navigable list, hubs first, each row a
     * keyboard-operable button that opens the note — the shape of the vault, still walkable.
     */
    private renderFallback(scene: GraphScene): void {
        const body = this.bodyEl ?? this.container;
        body.empty();
        const root = body.createDiv({ cls: c("graph-fallback") });
        root.createDiv({ cls: c("graph-fallback-note"), text: t("graph_unavailable") });
        const list = root.createDiv({ cls: c("graph-fallback-list"), attr: { role: "list" } });
        for (const i of scene.hubs) {
            const row = list.createEl("button", { cls: c("graph-fallback-row"), attr: { role: "listitem", "aria-label": scene.names[i], type: "button" } });
            const name = row.createSpan({ cls: c("graph-fallback-name"), text: scene.names[i] });
            hoverPreview(this.app, name, scene.ids[i], this);
            const links = scene.offsets[i + 1] - scene.offsets[i];
            row.createSpan({ cls: c("graph-fallback-meta"), text: tCount(links, "graph_fallback_connections", String(links)) });
            this.registerDomEvent(row, "click", () => this.open(i));
        }
    }
}
