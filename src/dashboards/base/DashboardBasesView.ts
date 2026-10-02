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
import { BasesView, Keymap, Menu, QueryController, setIcon, type PaneType } from "obsidian";
import { v4 as uuid } from "uuid";
import { log } from "architecture";
import { t, tCount } from "architecture/lang";
import { c } from "architecture/styles/helper";
import { hoverPreview } from "architecture/components/core/a11y";
import { DataStoreSnapshot, normalize, reconcilePlan } from "dashboards/datastore";
import {
    DashboardModel,
    PanelConfig,
    emptyDashboard,
    migrateDashboard,
    movePanel,
    type ChartTheme,
    type ComputedFields,
    type PanelLayout,
} from "dashboards/panels";
import type { ComputedWarning } from "dashboards/transform";
import { adaptResult } from "./adaptEntry";
import { FieldInspector } from "./FieldInspector";
import { PanelHost, type PanelHostActions } from "./PanelHost";
import { PanelConfigModal } from "./PanelConfigModal";
import { ComputedFieldsModal } from "./ComputedFieldsModal";
import { ComputedResolver } from "./scriptTransform";
import { readChartTheme } from "./themeReader";

export const DASHBOARD_VIEW_TYPE = "zettelflow-dashboard";
const CONFIG_KEY = "zfDashboard";
/** A click on a busy day lists at most this many notes — the menu is a picker, not a search. */
const MAX_MENU_NOTES = 25;

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
    private noticeEl: HTMLElement | null = null;
    private countEl: HTMLElement | null = null;

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

        // One quiet row: how many notes the Base selected, then the two things you do here.
        const toolbar = root.createDiv({ cls: c("base-dashboard-toolbar") });
        this.countEl = toolbar.createSpan({ cls: c("base-dashboard-count") });
        const computed = toolbar.createEl("button", { cls: c("base-dashboard-tool") });
        setIcon(computed.createSpan({ cls: c("base-dashboard-tool-icon") }), "sigma");
        computed.createSpan({ text: t("dashboard_computed_open") });
        this.registerDomEvent(computed, "click", () => this.openComputedModal());

        const add = toolbar.createEl("button", { cls: `${c("base-dashboard-tool")} mod-cta` });
        setIcon(add.createSpan({ cls: c("base-dashboard-tool-icon") }), "plus");
        add.createSpan({ text: t("dashboard_add_panel") });
        this.registerDomEvent(add, "click", () => this.openPanelModal(null));

        // Inline, contextual notice for computed fields (the messaging policy prefers inline over a
        // toast, #546) — hidden until something needs saying; a click opens the editor to fix it.
        this.noticeEl = root.createDiv({ cls: `${c("base-dashboard-notice")} zettelkasten-flow__is-hidden` });
        this.registerDomEvent(this.noticeEl, "click", () => this.openComputedModal());

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
     * the panels keep the un-enriched data (fail-safe) and the failure is surfaced inline.
     */
    private async enrichComputed(base: DataStoreSnapshot): Promise<void> {
        if (!this.model.computed?.enabled || !this.model.computed.code.trim()) return;
        const { snapshot: enriched, error, skipped, warnings } = await this.resolver.resolve(base, this.model.computed);
        if (this.baseSnapshot !== base) return; // a newer update owns the screen now
        this.setComputedNotice(error, skipped, warnings);
        if (!error && enriched !== base) {
            this.prevSnapshot = this.snapshot;
            this.snapshot = enriched;
            this.renderLayout();
        }
    }

    /**
     * A failed script (the panels keep the un-enriched data), or the notes it skipped (their computed
     * fields are empty) — said once, inline, under the toolbar.
     */
    private setComputedNotice(error: string | null, skipped = 0, warnings: ComputedWarning[] = []): void {
        const el = this.noticeEl;
        if (!el) return;
        el.empty();
        el.toggleClass("is-error", error !== null);
        const reason = (warnings.find((warning) => warning.row !== null) ?? warnings[0])?.message ?? "";
        const message = error
            ? t("dashboard_computed_error", error)
            : skipped > 0
                ? tCount(skipped, "dashboard_computed_skipped", String(skipped), reason)
                : null;
        if (!message) {
            el.addClass("zettelkasten-flow__is-hidden");
            return;
        }
        el.removeClass("zettelkasten-flow__is-hidden");
        setIcon(el.createSpan({ cls: c("base-dashboard-notice-icon") }), error ? "alert-circle" : "alert-triangle");
        el.createSpan({ text: message });
    }

    private openComputedModal(): void {
        const base = this.baseSnapshot;
        if (!base) return;
        new ComputedFieldsModal(this.app, base, this.resolver, this.model.computed, (computed: ComputedFields) => {
            this.model.computed = computed;
            this.saveModel();
            const latest = this.baseSnapshot ?? base;
            this.snapshot = latest; // drop any previous enrichment, then re-resolve
            this.setComputedNotice(null);
            this.renderLayout();
            void this.enrichComputed(latest);
        }).open();
    }

    private theme(): ChartTheme {
        return readChartTheme(this.rootEl ?? this.viewContainerEl);
    }

    private renderLayout(): void {
        if (!this.rootEl || !this.snapshot) return; // not mounted (node/test)
        this.countEl?.setText(tCount(this.snapshot.rowCount, "dashboard_note_count", String(this.snapshot.rowCount)));
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
        const actions = this.panelActions();
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

    private panelActions(): PanelHostActions {
        return {
            edit: (panel) => this.openPanelModal(panel),
            duplicate: (panel) => this.duplicatePanel(panel),
            remove: (panel) => this.removePanel(panel),
            move: (panel, dir) => this.reorderPanel(panel, dir),
            canMove: (panel, dir) => {
                const index = this.model.panels.findIndex((other) => other.id === panel.id);
                const target = index + dir;
                return index >= 0 && target >= 0 && target < this.model.panels.length;
            },
            setLayout: (panel, layout) => this.setPanelLayout(panel, layout),
            openNotes: (paths, evt) => this.openNotes(paths, evt),
            previewNote: (el, path) => hoverPreview(this.app, el, path, this),
        };
    }

    /**
     * Open what a click landed on: one note opens straight away (Mod-click → a new tab, as everywhere
     * in Obsidian); several — a busy calendar day — offer a native menu to pick from.
     */
    private openNotes(paths: string[], evt: MouseEvent): void {
        if (paths.length === 0) return;
        const open = (path: string, newTab: PaneType | boolean): void => {
            void this.app.workspace.openLinkText(path, "", newTab);
        };
        if (paths.length === 1) {
            open(paths[0], Keymap.isModEvent(evt));
            return;
        }
        const menu = new Menu();
        for (const path of paths.slice(0, MAX_MENU_NOTES)) {
            const name = (path.split("/").pop() ?? path).replace(/\.md$/, "");
            menu.addItem((item) =>
                item
                    .setTitle(name)
                    .setIcon("file-text")
                    .onClick((clickEvt) => open(path, Keymap.isModEvent(clickEvt))),
            );
        }
        menu.showAtMouseEvent(evt);
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
        new PanelConfigModal(this.app, this.snapshot, this.theme(), existing, (config) => {
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

    private setPanelLayout(config: PanelConfig, layout: PanelLayout): void {
        const index = this.model.panels.findIndex((panel) => panel.id === config.id);
        if (index < 0) return;
        this.model.panels[index] = { ...config, layout };
        this.saveModel();
        this.renderLayout();
    }

    /** A copy placed right after the original — the quickest way to a second, slightly different view. */
    private duplicatePanel(config: PanelConfig): void {
        const index = this.model.panels.findIndex((panel) => panel.id === config.id);
        const copy = JSON.parse(JSON.stringify(config)) as PanelConfig;
        copy.id = uuid();
        this.model.panels.splice(index < 0 ? this.model.panels.length : index + 1, 0, copy);
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
