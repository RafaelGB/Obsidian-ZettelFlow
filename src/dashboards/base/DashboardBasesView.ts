/**
 * The ZettelFlow "Dashboard" Bases view (epic #622, S1 #623) — the datasource seam.
 *
 * `extends BasesView extends Component`, so panels (from S2) mount as child Components and tear
 * down for free. On every `onDataUpdated` it reads `this.data` **fresh** (the API recreates the
 * result and its entries each update — `obsidian.d.ts` L1131-1136), adapts it at the boundary,
 * runs the pure `normalize`, and reconciles the field inspector in place. S1 draws no charts — the
 * inspector is the visible proof of the seam.
 */
import { BasesView, QueryController } from "obsidian";
import { log } from "architecture";
import { DataStoreSnapshot, normalize, reconcilePlan } from "dashboards/datastore";
import { adaptResult } from "./adaptEntry";
import { FieldInspector } from "./FieldInspector";

export const DASHBOARD_VIEW_TYPE = "zettelflow-dashboard";

export class DashboardBasesView extends BasesView {
    readonly type = DASHBOARD_VIEW_TYPE;

    private readonly viewContainerEl: HTMLElement;
    private inspector: FieldInspector | null = null;
    private snapshot: DataStoreSnapshot | null = null;

    constructor(controller: QueryController, containerEl: HTMLElement) {
        super(controller);
        this.viewContainerEl = containerEl;
    }

    /** The current normalized snapshot — exposed for tests and, from S2, for panels. */
    get currentSnapshot(): DataStoreSnapshot | null {
        return this.snapshot;
    }

    private ensureInspector(): void {
        if (this.inspector) return;
        const el = this.viewContainerEl as HTMLElement | undefined;
        // Mount only against a real Obsidian element (feature-detected, so node jest never builds DOM).
        if (!el || typeof el.empty !== "function") return;
        this.inspector = this.addChild(new FieldInspector(el));
    }

    onDataUpdated(): void {
        const result = this.data;
        if (!result) return;
        try {
            this.ensureInspector();
            const adapted = adaptResult(result, this.config);
            const previous = this.snapshot;
            const next = normalize(
                adapted.entries,
                adapted.properties,
                adapted.signature,
                previous ?? undefined,
            );
            this.snapshot = next;
            this.inspector?.render(next, reconcilePlan(previous, next));
        } catch (error) {
            // Bases is a young API; a malformed result must not take the Base down (risk #1).
            log.error("Base dashboard failed to process a data update", error);
        }
    }
}
