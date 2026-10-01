/**
 * The ZettelFlow "Dashboard" Bases view (epic #622) — the datasource seam (S1 #623) plus the panel
 * composition surface (S2 #624).
 *
 * `extends BasesView extends Component`, so each panel mounts as a child Component and tears down
 * for free. On every `onDataUpdated` it reads `this.data` **fresh** (the API recreates the result
 * and its entries each update — `obsidian.d.ts` L1131-1136), adapts it at the boundary, runs the
 * pure `normalize`, and refreshes. With no panels it shows the field inspector; with panels it
 * renders each from the shared snapshot. The panel list persists via `BasesViewConfig` only — no
 * `vault.*` (read-only over the vault, §XII).
 */
import { BasesView, QueryController, setIcon } from "obsidian";
import { log } from "architecture";
import { t } from "architecture/lang";
import { c } from "architecture/styles/helper";
import { DataStoreSnapshot, normalize, reconcilePlan } from "dashboards/datastore";
import {
    DashboardModel,
    PanelConfig,
    cycleWidth,
    emptyDashboard,
    migrateDashboard,
    movePanel,
    panelLayout,
    type ChartTheme,
    type ComputedFields,
} from "dashboards/panels";
import { adaptResult } from "./adaptEntry";
import { FieldInspector } from "./FieldInspector";
import { PanelHost, type PanelHostActions } from "./PanelHost";
import { PanelConfigModal } from "./PanelConfigModal";
import { ComputedFieldsModal } from "./ComputedFieldsModal";
import { ComputedResolver } from "./scriptTransform";
import { readChartTheme } from "./themeReader";

export const DASHBOARD_VIEW_TYPE = "zettelflow-dashboard";
const CONFIG_KEY = "zfDashboard";

export class DashboardBasesView extends BasesView {
    readonly type = DASHBOARD_VIEW_TYPE;

    private readonly viewContainerEl: HTMLElement;
    private rootEl: HTMLElement | null = null;
    private inspectorHostEl: HTMLElement | null = null;
    private panelsEl: HTMLElement | null = null;
    private inspector: FieldInspector | null = null;
    private model: DashboardModel = emptyDashboard();
    /** The config is loaded on the first data update, not in onload: `this.config` is not yet
     * populated when the view loads, so reading it there returned an empty model and lost panels. */
    private loaded = false;
    private readonly hosts = new Map<string, PanelHost>();
    /** The un-enriched snapshot from the last data update — the base computed fields enrich. */
    private baseSnapshot: DataStoreSnapshot | null = null;
    private snapshot: DataStoreSnapshot | null = null;
    private prevSnapshot: DataStoreSnapshot | null = null;
    private readonly resolver = new ComputedResolver();
    private errorEl: HTMLElement | null = null;

    constructor(controller: QueryController, containerEl: HTMLElement) {
        super(controller);
        this.viewContainerEl = containerEl;
    }

    /** The current normalized snapshot — exposed for tests and panels. */
    get currentSnapshot(): DataStoreSnapshot | null {
        return this.snapshot;
    }

    onload(): void {
        this.buildShell();
        this.registerEvent(this.app.workspace.on("css-change", () => this.applyTheme()));
        this.renderLayout();
    }

    private buildShell(): void {
        const el = this.viewContainerEl;
        if (!el || typeof el.empty !== "function") return; // node/test: no DOM
        el.empty();
        const root = el.createDiv({ cls: c("base-dashboard") });
        this.rootEl = root;

        const toolbar = root.createDiv({ cls: c("base-dashboard-toolbar") });
        const add = toolbar.createEl("button", { cls: `${c("base-dashboard-add")} mod-cta` });
        setIcon(add.createSpan({ cls: c("base-dashboard-add-icon") }), "plus");
        add.createSpan({ text: t("dashboard_add_panel") });
        this.registerDomEvent(add, "click", () => this.openPanelModal(null));

        const computed = toolbar.createEl("button", { cls: c("base-dashboard-computed-btn") });
        setIcon(computed.createSpan({ cls: c("base-dashboard-add-icon") }), "function-square");
        computed.createSpan({ text: t("dashboard_computed_open") });
        this.registerDomEvent(computed, "click", () => this.openComputedModal());

        // Inline, contextual error banner for a failed computed field (the messaging policy prefers
        // inline over a toast, #546) — hidden until something fails.
        this.errorEl = root.createDiv({ cls: `${c("base-dashboard-error")} zettelkasten-flow__is-hidden` });

        this.inspectorHostEl = root.createDiv({ cls: c("base-dashboard-inspector-host") });
        this.panelsEl = root.createDiv({ cls: c("base-dashboard-panels") });
    }

    onDataUpdated(): void {
        const result = this.data;
        if (!result) return;
        // Load the saved panels the first time data arrives — config is ready now, unlike in onload.
        if (!this.loaded) {
            this.model = this.loadModel();
            this.loaded = true;
        }
        try {
            const adapted = adaptResult(result, this.allProperties, this.config);
            const base = normalize(
                adapted.entries,
                adapted.properties,
                adapted.signature,
                this.baseSnapshot ?? undefined,
            );
            this.baseSnapshot = base;
            this.prevSnapshot = this.snapshot;
            this.snapshot = base; // draw the un-enriched data now; enrich off the render path
            this.renderLayout();
            void this.enrichComputed(base);
        } catch (error) {
            // Bases is a young API; a malformed result must not take the Base down (risk #1).
            log.error("Base dashboard failed to process a data update", error);
        }
    }

    /**
     * Resolve dashboard-level computed fields (#632) off the render path, then redraw with the
     * enriched snapshot — applied only if a newer data update has not superseded this one. On error
     * the panels keep the un-enriched data (fail-safe) and the failure is surfaced once.
     */
    private async enrichComputed(base: DataStoreSnapshot): Promise<void> {
        if (!this.model.computed?.enabled || !this.model.computed.code.trim()) return;
        const { snapshot: enriched, error } = await this.resolver.resolve(base, this.model.computed);
        this.setComputedError(error);
        if (!error && this.baseSnapshot === base && enriched !== base) {
            this.prevSnapshot = this.snapshot;
            this.snapshot = enriched;
            this.renderLayout();
        }
    }

    private setComputedError(message: string | null): void {
        const el = this.errorEl;
        if (!el) return;
        if (message) {
            el.setText(t("dashboard_computed_error", message));
            el.removeClass("zettelkasten-flow__is-hidden");
        } else {
            el.empty();
            el.addClass("zettelkasten-flow__is-hidden");
        }
    }

    private openComputedModal(): void {
        const fields = this.baseSnapshot?.schema.fields ?? [];
        new ComputedFieldsModal(this.app, fields, this.model.computed, (computed: ComputedFields) => {
            this.model.computed = computed;
            this.saveModel();
            const base = this.baseSnapshot;
            if (base) {
                this.snapshot = base; // drop any previous enrichment, then re-resolve
                this.renderLayout();
                void this.enrichComputed(base);
            }
        }).open();
    }

    private theme(): ChartTheme {
        return readChartTheme(this.rootEl ?? this.viewContainerEl);
    }

    private renderLayout(): void {
        if (!this.rootEl || !this.snapshot) return; // not mounted (node/test)
        if (this.model.panels.length === 0) {
            this.clearHosts();
            this.showInspector();
            return;
        }
        this.teardownInspector();
        this.syncHosts();
    }

    private showInspector(): void {
        if (!this.inspectorHostEl || !this.snapshot) return;
        if (!this.inspector) this.inspector = this.addChild(new FieldInspector(this.inspectorHostEl));
        this.inspector.render(this.snapshot, reconcilePlan(this.prevSnapshot, this.snapshot));
    }

    private teardownInspector(): void {
        if (this.inspector) {
            this.removeChild(this.inspector);
            this.inspector = null;
        }
        this.inspectorHostEl?.empty();
    }

    private syncHosts(): void {
        if (!this.panelsEl || !this.snapshot) return;
        const theme = this.theme();
        const actions: PanelHostActions = {
            edit: (panel) => this.openPanelModal(panel),
            remove: (panel) => this.removePanel(panel),
            move: (panel, dir) => this.reorderPanel(panel, dir),
            resize: (panel) => this.resizePanel(panel),
        };
        const live = new Set(this.model.panels.map((panel) => panel.id));
        for (const [id, host] of this.hosts) {
            if (!live.has(id)) {
                this.removeChild(host);
                this.hosts.delete(id);
            }
        }
        for (const config of this.model.panels) {
            let host = this.hosts.get(config.id);
            if (!host) {
                host = this.addChild(new PanelHost(this.panelsEl, config, actions));
                this.hosts.set(config.id, host);
            } else {
                host.setConfig(config);
            }
            host.update(this.snapshot, theme);
        }
        // Reflect the model's order in the DOM (a move is a reorder of the array).
        for (const config of this.model.panels) this.hosts.get(config.id)?.orderInto(this.panelsEl);
    }

    private clearHosts(): void {
        for (const host of this.hosts.values()) this.removeChild(host);
        this.hosts.clear();
        this.panelsEl?.empty();
    }

    private applyTheme(): void {
        if (!this.snapshot) return;
        const theme = this.theme();
        for (const host of this.hosts.values()) host.update(this.snapshot, theme);
    }

    private openPanelModal(existing: PanelConfig | null): void {
        if (!this.snapshot) return;
        new PanelConfigModal(this.app, this.snapshot.schema, existing, (config) => {
            const index = this.model.panels.findIndex((panel) => panel.id === config.id);
            if (index >= 0) this.model.panels[index] = config;
            else this.model.panels.push(config);
            this.saveModel();
            this.renderLayout();
        }).open();
    }

    private removePanel(config: PanelConfig): void {
        this.model.panels = this.model.panels.filter((panel) => panel.id !== config.id);
        this.saveModel();
        this.renderLayout();
    }

    private reorderPanel(config: PanelConfig, dir: -1 | 1): void {
        this.model.panels = movePanel(this.model.panels, config.id, dir);
        this.saveModel();
        this.renderLayout();
    }

    private resizePanel(config: PanelConfig): void {
        const index = this.model.panels.findIndex((panel) => panel.id === config.id);
        if (index < 0) return;
        this.model.panels[index] = { ...config, layout: cycleWidth(panelLayout(config)) };
        this.saveModel();
        this.renderLayout();
    }

    private loadModel(): DashboardModel {
        try {
            const raw = this.config.get(CONFIG_KEY);
            // Stored as a JSON string (most reliable to persist); tolerate a parsed object too.
            const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
            if (parsed && typeof parsed === "object" && Array.isArray((parsed as DashboardModel).panels)) {
                // Fold a legacy per-panel script (S6) into the dashboard-level computed field (#632).
                return migrateDashboard(parsed as DashboardModel);
            }
        } catch (error) {
            log.warn("Base dashboard config could not be read", error);
        }
        return emptyDashboard();
    }

    private saveModel(): void {
        try {
            this.config.set(CONFIG_KEY, JSON.stringify(this.model));
        } catch (error) {
            log.error("Base dashboard config could not be saved", error);
        }
    }
}
