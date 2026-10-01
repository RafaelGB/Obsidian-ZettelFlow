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
import { DashboardModel, PanelConfig, emptyDashboard, type ChartTheme } from "dashboards/panels";
import { adaptResult } from "./adaptEntry";
import { FieldInspector } from "./FieldInspector";
import { PanelHost } from "./PanelHost";
import { PanelConfigModal } from "./PanelConfigModal";
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
    private readonly hosts = new Map<string, PanelHost>();
    private snapshot: DataStoreSnapshot | null = null;
    private prevSnapshot: DataStoreSnapshot | null = null;

    constructor(controller: QueryController, containerEl: HTMLElement) {
        super(controller);
        this.viewContainerEl = containerEl;
    }

    /** The current normalized snapshot — exposed for tests and panels. */
    get currentSnapshot(): DataStoreSnapshot | null {
        return this.snapshot;
    }

    onload(): void {
        this.model = this.loadModel();
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

        this.inspectorHostEl = root.createDiv({ cls: c("base-dashboard-inspector-host") });
        this.panelsEl = root.createDiv({ cls: c("base-dashboard-panels") });
    }

    onDataUpdated(): void {
        const result = this.data;
        if (!result) return;
        try {
            const adapted = adaptResult(result, this.config);
            this.prevSnapshot = this.snapshot;
            this.snapshot = normalize(
                adapted.entries,
                adapted.properties,
                adapted.signature,
                this.prevSnapshot ?? undefined,
            );
            this.renderLayout();
        } catch (error) {
            // Bases is a young API; a malformed result must not take the Base down (risk #1).
            log.error("Base dashboard failed to process a data update", error);
        }
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
                host = this.addChild(
                    new PanelHost(
                        this.panelsEl,
                        config,
                        (panel) => this.openPanelModal(panel),
                        (panel) => this.removePanel(panel),
                    ),
                );
                this.hosts.set(config.id, host);
            } else {
                host.setConfig(config);
            }
            host.update(this.snapshot, theme);
        }
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

    private loadModel(): DashboardModel {
        try {
            const raw = this.config.get(CONFIG_KEY);
            if (raw && typeof raw === "object" && Array.isArray((raw as DashboardModel).panels)) {
                return raw as DashboardModel;
            }
        } catch (error) {
            log.warn("Base dashboard config could not be read", error);
        }
        return emptyDashboard();
    }

    private saveModel(): void {
        try {
            this.config.set(CONFIG_KEY, this.model);
        } catch (error) {
            log.error("Base dashboard config could not be saved", error);
        }
    }
}
