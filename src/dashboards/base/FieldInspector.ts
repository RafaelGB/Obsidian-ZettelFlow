/**
 * The field inspector — the visible empty-dashboard state for S1 (#623): what this Base contains,
 * before any panel exists. A child `Component` of the view, so it tears down automatically.
 *
 * It updates **in place** from a `ReconcilePlan`: the row count is re-set on every data update,
 * but the field list is only rebuilt when the set of fields actually changed (AC-4). DOM is built
 * with `createEl`/`empty()` and styled with `c()` classes + theme vars — never `innerHTML` or
 * inline styles (§I/§XV).
 */
import { Component, setIcon } from "obsidian";
import { t, tCount } from "architecture/lang";
import { c } from "architecture/styles/helper";
import { DataStoreSnapshot, ReconcilePlan, SchemaField } from "dashboards/datastore";

export class FieldInspector extends Component {
    private root: HTMLElement | null = null;
    private countEl: HTMLElement | null = null;
    private listEl: HTMLElement | null = null;
    private lastSnapshot: DataStoreSnapshot | null = null;

    constructor(private readonly containerEl: HTMLElement) {
        super();
    }

    onload(): void {
        this.containerEl.empty();
        const root = this.containerEl.createDiv({ cls: c("base-dashboard-inspector") });
        this.root = root;

        const empty = root.createDiv({ cls: c("base-dashboard-empty") });
        const icon = empty.createSpan({ cls: c("base-dashboard-empty-icon") });
        setIcon(icon, "bar-chart-3");
        const text = empty.createDiv({ cls: c("base-dashboard-empty-text") });
        text.createEl("h3", {
            text: t("dashboard_inspector_empty_title"),
            cls: c("base-dashboard-empty-title"),
        });
        text.createEl("p", {
            text: t("dashboard_inspector_empty_hint"),
            cls: c("base-dashboard-empty-hint"),
        });

        const fields = root.createDiv({ cls: c("base-dashboard-fields") });
        const header = fields.createDiv({ cls: c("base-dashboard-fields-header") });
        header.createEl("h4", {
            text: t("dashboard_inspector_fields_heading"),
            cls: c("base-dashboard-fields-heading"),
        });
        this.countEl = header.createSpan({ cls: c("base-dashboard-row-count") });
        this.listEl = fields.createEl("ul", { cls: c("base-dashboard-field-list") });

        if (this.lastSnapshot) this.render(this.lastSnapshot, null);
    }

    private typeLabel(field: SchemaField): string {
        return t(`dashboard_type_${field.type}` as Parameters<typeof t>[0]);
    }

    /** Apply a new snapshot. `plan === null` forces a full field-list rebuild (first paint). */
    render(snapshot: DataStoreSnapshot, plan: ReconcilePlan | null): void {
        this.lastSnapshot = snapshot;
        if (!this.root || !this.countEl || !this.listEl) return; // not mounted yet

        this.countEl.setText(
            tCount(snapshot.rowCount, "dashboard_inspector_row_count", String(snapshot.rowCount)),
        );

        const fieldsChanged = plan === null || plan.added.length > 0 || plan.removed.length > 0;
        if (!fieldsChanged) return;

        this.listEl.empty();
        if (snapshot.schema.fields.length === 0) {
            this.listEl.createEl("li", {
                text: t("dashboard_inspector_no_fields"),
                cls: c("base-dashboard-field-empty"),
            });
            return;
        }
        for (const field of snapshot.schema.fields) {
            const item = this.listEl.createEl("li", { cls: c("base-dashboard-field") });
            item.createSpan({ text: field.name, cls: c("base-dashboard-field-name") });
            item.createSpan({ text: this.typeLabel(field), cls: c("base-dashboard-field-type") });
        }
    }

    onunload(): void {
        this.root = null;
        this.countEl = null;
        this.listEl = null;
    }
}
