/**
 * The panel authoring surface (§XIII — a capability is authorable from the UI, not hand-edited
 * YAML). Pick a type, map its channels from the Base's fields, add level-2 transforms, name it.
 * Defaults come from `suggestMapping`. The channel loop is generic (channel key == PanelMapping
 * field) and reads the **effective** fields, so a transform's virtual output is mappable. Epic #622.
 */
import { Modal, Setting, setIcon } from "obsidian";
import type { App } from "obsidian";
import { v4 as uuid } from "uuid";
import { t } from "architecture/lang";
import { c } from "architecture/styles/helper";
import type { Schema, SchemaField } from "dashboards/datastore";
import {
    PANEL_TYPES,
    panelTypeList,
    suggestMapping,
    type AggregateFn,
    type ChannelSpec,
    type PanelConfig,
    type PanelMapping,
    type PanelType,
} from "dashboards/panels";
import { effectiveFields } from "dashboards/transform";
import type { CalcOp, FilterOp, TransformStep, TransformType } from "dashboards/transform";

const AGG_LABEL_KEYS: Record<AggregateFn, string> = {
    sum: "dashboard_agg_sum",
    avg: "dashboard_agg_avg",
    min: "dashboard_agg_min",
    max: "dashboard_agg_max",
    count: "dashboard_agg_count",
};

const TF_LABEL_KEYS: Record<TransformType, string> = {
    filter: "dashboard_tf_filter",
    sort: "dashboard_tf_sort",
    groupBy: "dashboard_tf_groupby",
    aggregate: "dashboard_tf_aggregate",
    bin: "dashboard_tf_bin",
    calculate: "dashboard_tf_calculate",
    normalize: "dashboard_tf_normalize",
    movingAverage: "dashboard_tf_moving_average",
    cumulative: "dashboard_tf_cumulative",
};

const FILTER_OPS: FilterOp[] = ["eq", "neq", "gt", "gte", "lt", "lte", "contains"];
const CALC_OPS: CalcOp[] = ["add", "sub", "mul", "div"];
const OP_SYMBOL: Record<FilterOp | CalcOp, string> = {
    eq: "=", neq: "≠", gt: ">", gte: "≥", lt: "<", lte: "≤", contains: "⊃",
    add: "+", sub: "−", mul: "×", div: "÷",
};
const AGG_ORDER: AggregateFn[] = ["avg", "sum", "min", "max", "count"];

export class PanelConfigModal extends Modal {
    private type: PanelType;
    private mapping: PanelMapping;
    private transforms: TransformStep[];
    private title: string;
    private typeChooserEl: HTMLElement | null = null;
    private channelsEl: HTMLElement | null = null;
    private transformsEl: HTMLElement | null = null;

    constructor(
        app: App,
        private readonly schema: Schema,
        private readonly initial: PanelConfig | null,
        private readonly onSubmit: (config: PanelConfig) => void,
    ) {
        super(app);
        this.type = initial?.type ?? "stat";
        this.mapping = initial ? { ...initial.mapping } : suggestMapping(this.type, schema);
        this.transforms = initial?.transforms ? initial.transforms.map((step) => ({ ...step })) : [];
        this.title = initial?.title ?? "";
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", {
            text: this.initial ? t("dashboard_edit_panel") : t("dashboard_new_panel_title"),
        });

        contentEl.createDiv({ cls: c("base-dashboard-channel-label"), text: t("dashboard_panel_type") });
        this.typeChooserEl = contentEl.createDiv({ cls: c("base-dashboard-type-chooser") });
        this.renderTypeChooser();

        new Setting(contentEl)
            .setName(t("dashboard_panel_title"))
            .addText((txt) => txt.setValue(this.title).onChange((value) => (this.title = value)));

        this.channelsEl = contentEl.createDiv({ cls: c("base-dashboard-channels") });
        this.renderChannels();

        contentEl.createEl("h4", { text: t("dashboard_transforms_heading") });
        this.transformsEl = contentEl.createDiv({ cls: c("base-dashboard-transforms") });
        this.renderTransforms();

        new Setting(contentEl).addButton((btn) =>
            btn.setButtonText(t("dashboard_save")).setCta().onClick(() => this.submit()),
        );
    }

    private bag(): Record<string, unknown> {
        return this.mapping as Record<string, unknown>;
    }

    /** The fields available to map — the Base's fields after the configured transforms (S5). */
    private fields(): SchemaField[] {
        return effectiveFields(this.schema.fields, this.transforms);
    }

    private eligibleFields(accepts: readonly string[]): SchemaField[] {
        const fields = this.fields();
        const eligible = fields.filter((field) => accepts.includes(field.type));
        return eligible.length > 0 ? eligible : fields;
    }

    private renderSingle(host: HTMLElement, channel: ChannelSpec): void {
        new Setting(host).setName(t(channel.labelKey as Parameters<typeof t>[0])).addDropdown((dd) => {
            if (!channel.required) dd.addOption("", "—");
            for (const field of this.eligibleFields(channel.accepts)) dd.addOption(field.id, field.name);
            dd.setValue((this.bag()[channel.key] as string | undefined) ?? "").onChange((value) => {
                this.bag()[channel.key] = value || undefined;
            });
        });
    }

    private renderMultiple(host: HTMLElement, channel: ChannelSpec): void {
        host.createDiv({ cls: c("base-dashboard-channel-label"), text: t(channel.labelKey as Parameters<typeof t>[0]) });
        const selected = this.selected(channel.key);
        const fields = this.eligibleFields(channel.accepts);

        // One removable row per chosen field — you see only what you picked, not a toggle per field.
        for (const id of selected) {
            const field = fields.find((candidate) => candidate.id === id);
            new Setting(host).setName(field?.name ?? id).addExtraButton((btn) =>
                btn
                    .setIcon("x")
                    .setTooltip(t("dashboard_remove_transform"))
                    .onClick(() => {
                        this.bag()[channel.key] = this.selected(channel.key).filter((other) => other !== id);
                        this.renderChannels();
                    }),
            );
        }

        // A dropdown that adds one more — scales to a Base with many fields.
        const remaining = fields.filter((field) => !selected.includes(field.id));
        if (remaining.length > 0) {
            new Setting(host).addDropdown((dd) => {
                dd.addOption("", t("dashboard_channel_add"));
                for (const field of remaining) dd.addOption(field.id, field.name);
                dd.setValue("").onChange((value) => {
                    if (!value) return;
                    this.bag()[channel.key] = [...this.selected(channel.key), value];
                    this.renderChannels();
                });
            });
        }
    }

    private selected(key: string): string[] {
        return (this.bag()[key] as string[] | undefined) ?? [];
    }

    private renderTypeChooser(): void {
        const host = this.typeChooserEl;
        if (!host) return;
        host.empty();
        for (const spec of panelTypeList()) {
            const option = host.createEl("button", { cls: c("base-dashboard-type-option") });
            if (spec.type === this.type) option.addClass("is-active");
            setIcon(option.createSpan({ cls: c("base-dashboard-type-icon") }), spec.icon);
            option.createSpan({
                cls: c("base-dashboard-type-label"),
                text: t(spec.labelKey as Parameters<typeof t>[0]),
            });
            option.addEventListener("click", () => {
                if (this.type === spec.type) return;
                this.type = spec.type;
                this.mapping = suggestMapping(this.type, this.schema);
                this.renderTypeChooser();
                this.renderChannels();
            });
        }
    }

    private renderChannels(): void {
        const host = this.channelsEl;
        if (!host) return;
        host.empty();
        for (const channel of PANEL_TYPES[this.type].channels) {
            if (channel.multiple) this.renderMultiple(host, channel);
            else this.renderSingle(host, channel);
        }
        if (this.type === "stat") {
            new Setting(host).setName(t("dashboard_aggregate")).addDropdown((dd) => {
                for (const agg of AGG_ORDER) dd.addOption(agg, t(AGG_LABEL_KEYS[agg] as Parameters<typeof t>[0]));
                dd.setValue(this.mapping.aggregate ?? "avg").onChange((value) => {
                    this.mapping.aggregate = value as AggregateFn;
                });
            });
        }
    }

    private renderTransforms(): void {
        const host = this.transformsEl;
        if (!host) return;
        host.empty();
        this.transforms.forEach((step, index) => this.renderStep(host, step, index));

        new Setting(host).setName(t("dashboard_add_transform")).addDropdown((dd) => {
            dd.addOption("", "—");
            for (const type of Object.keys(TF_LABEL_KEYS) as TransformType[]) {
                dd.addOption(type, t(TF_LABEL_KEYS[type] as Parameters<typeof t>[0]));
            }
            dd.setValue("").onChange((value) => {
                if (!value) return;
                this.transforms.push({ id: uuid(), type: value as TransformType });
                this.renderTransforms();
                this.renderChannels();
            });
        });
    }

    private renderStep(host: HTMLElement, step: TransformStep, index: number): void {
        const setting = new Setting(host).setName(t(TF_LABEL_KEYS[step.type] as Parameters<typeof t>[0]));
        const refresh = (): void => {
            this.renderTransforms();
            this.renderChannels();
        };

        const fieldDropdown = (get: () => string | undefined, set: (v: string | undefined) => void): void => {
            setting.addDropdown((dd) => {
                dd.addOption("", "—");
                for (const field of this.fields()) dd.addOption(field.id, field.name);
                dd.setValue(get() ?? "").onChange((v) => {
                    set(v || undefined);
                    refresh();
                });
            });
        };

        fieldDropdown(() => step.field, (v) => (step.field = v));

        if (step.type === "filter") {
            setting.addDropdown((dd) => {
                for (const op of FILTER_OPS) dd.addOption(op, OP_SYMBOL[op]);
                dd.setValue(step.op ?? "eq").onChange((v) => (step.op = v as FilterOp));
            });
            setting.addText((txt) => txt.setPlaceholder(t("dashboard_tf_value")).setValue(step.value ?? "").onChange((v) => (step.value = v)));
        } else if (step.type === "sort") {
            setting.addDropdown((dd) => {
                dd.addOption("asc", t("dashboard_direction_asc"));
                dd.addOption("desc", t("dashboard_direction_desc"));
                dd.setValue(step.direction ?? "asc").onChange((v) => (step.direction = v as "asc" | "desc"));
            });
        } else if (step.type === "groupBy") {
            fieldDropdown(() => step.field2, (v) => (step.field2 = v));
            setting.addDropdown((dd) => {
                for (const agg of AGG_ORDER) dd.addOption(agg, t(AGG_LABEL_KEYS[agg] as Parameters<typeof t>[0]));
                dd.setValue(step.aggregate ?? "sum").onChange((v) => (step.aggregate = v as AggregateFn));
            });
        } else if (step.type === "aggregate") {
            setting.addDropdown((dd) => {
                for (const agg of AGG_ORDER) dd.addOption(agg, t(AGG_LABEL_KEYS[agg] as Parameters<typeof t>[0]));
                dd.setValue(step.aggregate ?? "sum").onChange((v) => (step.aggregate = v as AggregateFn));
            });
        } else if (step.type === "bin") {
            setting.addText((txt) => txt.setPlaceholder(t("dashboard_tf_size")).setValue(step.value ?? "").onChange((v) => (step.value = v)));
        } else if (step.type === "calculate") {
            setting.addDropdown((dd) => {
                for (const op of CALC_OPS) dd.addOption(op, OP_SYMBOL[op]);
                dd.setValue(step.op ?? "mul").onChange((v) => (step.op = v as CalcOp));
            });
            setting.addText((txt) => txt.setPlaceholder(t("dashboard_tf_value")).setValue(step.value ?? "").onChange((v) => (step.value = v)));
            setting.addText((txt) => txt.setPlaceholder(t("dashboard_tf_new_field")).setValue(step.newField ?? "").onChange((v) => {
                step.newField = v || undefined;
                refresh();
            }));
        } else if (step.type === "movingAverage") {
            setting.addText((txt) => txt.setPlaceholder(t("dashboard_tf_window")).setValue(step.value ?? "").onChange((v) => (step.value = v)));
        }

        setting.addExtraButton((btn) =>
            btn
                .setIcon("trash-2")
                .setTooltip(t("dashboard_remove_transform"))
                .onClick(() => {
                    this.transforms.splice(index, 1);
                    refresh();
                }),
        );
    }

    private submit(): void {
        this.onSubmit({
            id: this.initial?.id ?? uuid(),
            type: this.type,
            title: this.title.trim() || undefined,
            mapping: this.mapping,
            transforms: this.transforms.length > 0 ? this.transforms : undefined,
        });
        this.close();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
