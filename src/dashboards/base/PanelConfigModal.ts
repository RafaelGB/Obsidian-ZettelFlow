/**
 * The panel authoring surface (§XIII — a capability is authorable from the UI, not hand-edited
 * YAML). Pick a type, map its channels from the Base's fields, name it. Defaults come from
 * `suggestMapping` so a new panel renders immediately. Epic #622, S2 #624.
 */
import { Modal, Setting } from "obsidian";
import type { App } from "obsidian";
import { v4 as uuid } from "uuid";
import { t } from "architecture/lang";
import { c } from "architecture/styles/helper";
import type { Schema } from "dashboards/datastore";
import {
    PANEL_TYPES,
    panelTypeList,
    suggestMapping,
    type AggregateFn,
    type PanelConfig,
    type PanelMapping,
    type PanelType,
} from "dashboards/panels";

const AGG_LABEL_KEYS: Record<AggregateFn, string> = {
    sum: "dashboard_agg_sum",
    avg: "dashboard_agg_avg",
    min: "dashboard_agg_min",
    max: "dashboard_agg_max",
    count: "dashboard_agg_count",
};

export class PanelConfigModal extends Modal {
    private type: PanelType;
    private mapping: PanelMapping;
    private title: string;
    private channelsEl: HTMLElement | null = null;

    constructor(
        app: App,
        private readonly schema: Schema,
        private readonly initial: PanelConfig | null,
        private readonly onSubmit: (config: PanelConfig) => void,
    ) {
        super(app);
        this.type = initial?.type ?? "stat";
        this.mapping = initial ? { ...initial.mapping } : suggestMapping(this.type, schema);
        this.title = initial?.title ?? "";
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", {
            text: this.initial ? t("dashboard_edit_panel") : t("dashboard_new_panel_title"),
        });

        new Setting(contentEl).setName(t("dashboard_panel_type")).addDropdown((dd) => {
            for (const spec of panelTypeList()) {
                dd.addOption(spec.type, t(spec.labelKey as Parameters<typeof t>[0]));
            }
            dd.setValue(this.type).onChange((value) => {
                this.type = value as PanelType;
                this.mapping = suggestMapping(this.type, this.schema);
                this.renderChannels();
            });
        });

        new Setting(contentEl)
            .setName(t("dashboard_panel_title"))
            .addText((txt) => txt.setValue(this.title).onChange((value) => (this.title = value)));

        this.channelsEl = contentEl.createDiv({ cls: c("base-dashboard-channels") });
        this.renderChannels();

        new Setting(contentEl).addButton((btn) =>
            btn.setButtonText(t("dashboard_save")).setCta().onClick(() => this.submit()),
        );
    }

    private eligibleFields(accepts: readonly string[]): Schema["fields"] {
        const eligible = this.schema.fields.filter((field) => accepts.includes(field.type));
        return eligible.length > 0 ? eligible : this.schema.fields;
    }

    private renderChannels(): void {
        const host = this.channelsEl;
        if (!host) return;
        host.empty();
        const spec = PANEL_TYPES[this.type];

        for (const channel of spec.channels) {
            if (channel.key === "series") {
                host.createDiv({
                    cls: c("base-dashboard-channel-label"),
                    text: t(channel.labelKey as Parameters<typeof t>[0]),
                });
                for (const field of this.eligibleFields(channel.accepts)) {
                    new Setting(host).setName(field.name).addToggle((tg) =>
                        tg.setValue((this.mapping.series ?? []).includes(field.id)).onChange((on) => {
                            const set = new Set(this.mapping.series ?? []);
                            if (on) set.add(field.id);
                            else set.delete(field.id);
                            this.mapping.series = [...set];
                        }),
                    );
                }
                continue;
            }

            new Setting(host).setName(t(channel.labelKey as Parameters<typeof t>[0])).addDropdown((dd) => {
                dd.addOption("", "—");
                for (const field of this.eligibleFields(channel.accepts)) dd.addOption(field.id, field.name);
                const current = channel.key === "value" ? this.mapping.value : this.mapping.category;
                dd.setValue(current ?? "").onChange((value) => {
                    if (channel.key === "value") this.mapping.value = value || undefined;
                    else this.mapping.category = value || undefined;
                });
            });
        }

        if (this.type === "stat") {
            new Setting(host).setName(t("dashboard_aggregate")).addDropdown((dd) => {
                const order: AggregateFn[] = ["avg", "sum", "min", "max", "count"];
                for (const agg of order) dd.addOption(agg, t(AGG_LABEL_KEYS[agg] as Parameters<typeof t>[0]));
                dd.setValue(this.mapping.aggregate ?? "avg").onChange((value) => {
                    this.mapping.aggregate = value as AggregateFn;
                });
            });
        }
    }

    private submit(): void {
        this.onSubmit({
            id: this.initial?.id ?? uuid(),
            type: this.type,
            title: this.title.trim() || undefined,
            mapping: this.mapping,
        });
        this.close();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
