/**
 * The panel authoring surface (§XIII — a capability is authorable from the UI, not hand-edited
 * YAML). Pick a type, map its channels from the Base's fields, add level-2 transforms, name it.
 * Defaults come from `suggestMapping`. The channel loop is generic (channel key == PanelMapping
 * field) and reads the **effective** fields, so a transform's virtual output is mappable. Epic #622.
 *
 * Built from Obsidian's own parts (#632 UX): `setTitle`, `Setting` rows under `setHeading()`
 * sections, and the native `modal-button-container` footer. Beside the form, a **live preview** draws
 * the panel exactly as the dashboard will — with this Base's real data — as you change it, so a
 * mapping is something you see rather than something you guess.
 */
import { Modal, Setting } from "obsidian";
import type { App } from "obsidian";
import { v4 as uuid } from "uuid";
import { t } from "architecture/lang";
import { c } from "architecture/styles/helper";
import type { DataStoreSnapshot, FieldType, SchemaField } from "dashboards/datastore";
import {
    PANEL_TYPES,
    panelTypeList,
    suggestMapping,
    type AggregateFn,
    type ChannelSpec,
    type ChartTheme,
    type PanelConfig,
    type PanelMapping,
    type PanelType,
} from "dashboards/panels";
import { effectiveFields } from "dashboards/transform";
import type { CalcOp, FilterOp, TransformStep, TransformType } from "dashboards/transform";
import { PanelHost, type TaskPort } from "./PanelHost";
import { setIconWithFallback } from "./icons";

type LocaleKey = Parameters<typeof t>[0];

const AGG_LABEL_KEYS: Record<AggregateFn, LocaleKey> = {
    sum: "dashboard_agg_sum",
    avg: "dashboard_agg_avg",
    min: "dashboard_agg_min",
    max: "dashboard_agg_max",
    count: "dashboard_agg_count",
};

const TF_LABEL_KEYS: Record<TransformType, LocaleKey> = {
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

const FILTER_OPS: FilterOp[] = ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "lastDays"];
const CALC_OPS: CalcOp[] = ["add", "sub", "mul", "div"];
const OP_SYMBOL: Record<Exclude<FilterOp, "lastDays"> | CalcOp, string> = {
    eq: "=", neq: "≠", gt: ">", gte: "≥", lt: "<", lte: "≤", contains: "⊃",
    add: "+", sub: "−", mul: "×", div: "÷",
};

/** A filter operator as the dropdown shows it — a symbol, or words where a symbol would not read. */
function filterOpLabel(op: FilterOp): string {
    return op === "lastDays" ? t("dashboard_op_last_days") : OP_SYMBOL[op];
}
const AGG_ORDER: AggregateFn[] = ["avg", "sum", "min", "max", "count"];

function typeLabelKey(type: FieldType): LocaleKey {
    return `dashboard_type_${type}` as LocaleKey;
}

export class PanelConfigModal extends Modal {
    private type: PanelType;
    private mapping: PanelMapping;
    private transforms: TransformStep[];
    private title: string;
    private typeChooserEl: HTMLElement | null = null;
    private channelsEl: HTMLElement | null = null;
    private transformsEl: HTMLElement | null = null;
    private preview: PanelHost | null = null;
    private previewFrame = 0;

    constructor(
        app: App,
        private readonly snapshot: DataStoreSnapshot,
        private readonly theme: ChartTheme,
        /** Reading tasks, for a Tasks panel's preview — the preview never writes. */
        private readonly tasks: Pick<TaskPort, "load">,
        private readonly initial: PanelConfig | null,
        private readonly onSubmit: (config: PanelConfig) => void,
    ) {
        super(app);
        this.type = initial?.type ?? "stat";
        this.mapping = initial ? { ...initial.mapping } : suggestMapping(this.type, snapshot.schema);
        this.transforms = initial?.transforms ? initial.transforms.map((step) => ({ ...step })) : [];
        this.title = initial?.title ?? "";
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.modalEl.addClass(c("base-dashboard-modal"));
        this.setTitle(this.initial ? t("dashboard_edit_panel") : t("dashboard_new_panel_title"));

        const layout = contentEl.createDiv({ cls: c("base-dashboard-modal-layout") });
        const form = layout.createDiv({ cls: c("base-dashboard-modal-form") });
        const aside = layout.createDiv({ cls: c("base-dashboard-modal-preview") });

        this.typeChooserEl = form.createDiv({
            cls: c("base-dashboard-type-chooser"),
            attr: { role: "radiogroup", "aria-label": t("dashboard_panel_type") },
        });
        this.renderTypeChooser();

        new Setting(form).setName(t("dashboard_panel_title")).addText((txt) =>
            txt
                .setPlaceholder(this.typeLabel(this.type))
                .setValue(this.title)
                .onChange((value) => {
                    this.title = value;
                    this.changed();
                }),
        );

        new Setting(form).setName(t("dashboard_data_heading")).setHeading();
        this.channelsEl = form.createDiv({ cls: c("base-dashboard-channels") });
        this.renderChannels();

        new Setting(form).setName(t("dashboard_transforms_heading")).setDesc(t("dashboard_transforms_desc")).setHeading();
        this.transformsEl = form.createDiv({ cls: c("base-dashboard-transforms") });
        this.renderTransforms();

        aside.createDiv({ cls: c("base-dashboard-preview-label"), text: t("dashboard_preview") });
        this.preview = new PanelHost(aside, this.draft(), null, { preview: true, tasks: { load: this.tasks.load } });
        this.preview.load();
        this.changed();

        const footer = contentEl.createDiv({ cls: "modal-button-container" });
        footer.createEl("button", { text: t("dashboard_cancel") }).addEventListener("click", () => this.close());
        footer
            .createEl("button", { cls: "mod-cta", text: t("dashboard_save") })
            .addEventListener("click", () => this.submit());
    }

    private typeLabel(type: PanelType): string {
        return t(PANEL_TYPES[type].labelKey as LocaleKey);
    }

    /** The panel as it stands in the form — what the preview draws and what Save stores. */
    private draft(): PanelConfig {
        return {
            id: this.initial?.id ?? "preview",
            type: this.type,
            title: this.title.trim() || undefined,
            mapping: this.mapping,
            transforms: this.transforms.length > 0 ? this.transforms : undefined,
            layout: this.initial?.layout,
        };
    }

    /** Redraw the preview on the next frame — a burst of edits paints once. */
    private changed(): void {
        if (this.previewFrame) window.cancelAnimationFrame(this.previewFrame);
        this.previewFrame = window.requestAnimationFrame(() => {
            this.previewFrame = 0;
            if (!this.preview) return;
            this.preview.setConfig(this.draft());
            this.preview.update(this.snapshot, this.theme);
        });
    }

    private bag(): Record<string, unknown> {
        return this.mapping as Record<string, unknown>;
    }

    /** The fields available to map — the Base's fields after the configured transforms (S5). */
    private fields(): SchemaField[] {
        return effectiveFields(this.snapshot.schema.fields, this.transforms);
    }

    private eligibleFields(accepts: readonly string[]): SchemaField[] {
        const fields = this.fields();
        const eligible = fields.filter((field) => accepts.includes(field.type));
        return eligible.length > 0 ? eligible : fields;
    }

    /** A field as the picker shows it: its name, and the type it charts as. */
    private optionLabel(field: SchemaField): string {
        return `${field.name} · ${t(typeLabelKey(field.type)).toLowerCase()}`;
    }

    private renderSingle(host: HTMLElement, channel: ChannelSpec): void {
        new Setting(host).setName(t(channel.labelKey as LocaleKey)).addDropdown((dd) => {
            if (!channel.required) dd.addOption("", "—");
            for (const field of this.eligibleFields(channel.accepts)) dd.addOption(field.id, this.optionLabel(field));
            dd.setValue((this.bag()[channel.key] as string | undefined) ?? "").onChange((value) => {
                this.bag()[channel.key] = value || undefined;
                this.changed();
            });
        });
    }

    private renderMultiple(host: HTMLElement, channel: ChannelSpec): void {
        const selected = this.selected(channel.key);
        const fields = this.eligibleFields(channel.accepts);
        const remaining = fields.filter((field) => !selected.includes(field.id));

        // The channel is one row: its chosen fields as removable pills, and a dropdown adding one more
        // — you see what you picked, and it scales to a Base with many fields.
        const setting = new Setting(host).setName(t(channel.labelKey as LocaleKey));
        const pills = setting.controlEl.createDiv({ cls: c("base-dashboard-pills") });
        for (const id of selected) {
            const field = fields.find((candidate) => candidate.id === id);
            const pill = pills.createSpan({ cls: c("base-dashboard-pill"), text: field?.name ?? id });
            const remove = pill.createEl("button", {
                cls: `clickable-icon ${c("base-dashboard-pill-remove")}`,
                attr: { type: "button", "aria-label": t("dashboard_remove_transform") },
            });
            setIconWithFallback(remove, "x");
            remove.addEventListener("click", () => {
                this.bag()[channel.key] = this.selected(channel.key).filter((other) => other !== id);
                this.renderChannels();
                this.changed();
            });
        }
        if (remaining.length > 0) {
            setting.addDropdown((dd) => {
                dd.addOption("", t("dashboard_channel_add"));
                for (const field of remaining) dd.addOption(field.id, this.optionLabel(field));
                dd.setValue("").onChange((value) => {
                    if (!value) return;
                    this.bag()[channel.key] = [...this.selected(channel.key), value];
                    this.renderChannels();
                    this.changed();
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
            const active = spec.type === this.type;
            const option = host.createEl("button", {
                cls: c("base-dashboard-type-option"),
                attr: { type: "button", role: "radio", "aria-checked": String(active) },
            });
            option.toggleClass("is-active", active);
            setIconWithFallback(option.createSpan({ cls: c("base-dashboard-type-icon") }), spec.icon);
            option.createSpan({ cls: c("base-dashboard-type-label"), text: this.typeLabel(spec.type) });
            option.addEventListener("click", () => {
                if (this.type === spec.type) return;
                this.type = spec.type;
                this.mapping = suggestMapping(this.type, this.snapshot.schema);
                this.renderTypeChooser();
                this.renderChannels();
                this.changed();
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
        if (this.type === "tasks") this.renderTaskOptions(host);
        if (this.type === "stat") {
            new Setting(host).setName(t("dashboard_aggregate")).addDropdown((dd) => {
                for (const agg of AGG_ORDER) dd.addOption(agg, t(AGG_LABEL_KEYS[agg]));
                dd.setValue(this.mapping.aggregate ?? "avg").onChange((value) => {
                    this.mapping.aggregate = value as AggregateFn;
                    this.changed();
                });
            });
        }
    }

    /** A Tasks panel maps no field: it asks which tasks, and whether to group them by note (#635). */
    private renderTaskOptions(host: HTMLElement): void {
        new Setting(host).setName(t("dashboard_tasks_show")).addDropdown((dd) => {
            dd.addOption("open", t("dashboard_tasks_show_open"));
            dd.addOption("done", t("dashboard_tasks_show_done"));
            dd.addOption("all", t("dashboard_tasks_show_all"));
            dd.setValue(this.mapping.taskShow ?? "open").onChange((value) => {
                this.mapping.taskShow = value as "open" | "done" | "all";
                this.changed();
            });
        });
        new Setting(host).setName(t("dashboard_tasks_group")).addToggle((tg) =>
            tg.setValue(this.mapping.taskGroup ?? true).onChange((on) => {
                this.mapping.taskGroup = on;
                this.changed();
            }),
        );
    }

    private renderTransforms(): void {
        const host = this.transformsEl;
        if (!host) return;
        host.empty();
        this.transforms.forEach((step, index) => this.renderStep(host, step, index));

        new Setting(host).setName(t("dashboard_add_transform")).addDropdown((dd) => {
            dd.addOption("", "—");
            for (const type of Object.keys(TF_LABEL_KEYS) as TransformType[]) {
                dd.addOption(type, t(TF_LABEL_KEYS[type]));
            }
            dd.setValue("").onChange((value) => {
                if (!value) return;
                this.transforms.push({ id: uuid(), type: value as TransformType });
                this.renderTransforms();
                this.renderChannels();
                this.changed();
            });
        });
    }

    private renderStep(host: HTMLElement, step: TransformStep, index: number): void {
        const setting = new Setting(host).setName(`${index + 1}. ${t(TF_LABEL_KEYS[step.type])}`);
        setting.settingEl.addClass(c("base-dashboard-step"));
        const refresh = (): void => {
            this.renderTransforms();
            this.renderChannels();
            this.changed();
        };
        // A value typed into a step redraws the preview without rebuilding the form under the caret.
        const changed = (): void => this.changed();

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
        const aggregateDropdown = (fallback: AggregateFn): void => {
            setting.addDropdown((dd) => {
                for (const agg of AGG_ORDER) dd.addOption(agg, t(AGG_LABEL_KEYS[agg]));
                dd.setValue(step.aggregate ?? fallback).onChange((v) => {
                    step.aggregate = v as AggregateFn;
                    changed();
                });
            });
        };
        const valueText = (placeholder: LocaleKey): void => {
            setting.addText((txt) =>
                txt
                    .setPlaceholder(t(placeholder))
                    .setValue(step.value ?? "")
                    .onChange((v) => {
                        step.value = v;
                        changed();
                    }),
            );
        };

        fieldDropdown(() => step.field, (v) => (step.field = v));

        if (step.type === "filter") {
            setting.addDropdown((dd) => {
                for (const op of FILTER_OPS) dd.addOption(op, filterOpLabel(op));
                dd.setValue(step.op ?? "eq").onChange((v) => {
                    step.op = v as FilterOp;
                    changed();
                });
            });
            valueText("dashboard_tf_value");
        } else if (step.type === "sort") {
            setting.addDropdown((dd) => {
                dd.addOption("asc", t("dashboard_direction_asc"));
                dd.addOption("desc", t("dashboard_direction_desc"));
                dd.setValue(step.direction ?? "asc").onChange((v) => {
                    step.direction = v as "asc" | "desc";
                    changed();
                });
            });
        } else if (step.type === "groupBy") {
            fieldDropdown(() => step.field2, (v) => (step.field2 = v));
            aggregateDropdown("sum");
        } else if (step.type === "aggregate") {
            aggregateDropdown("sum");
        } else if (step.type === "bin") {
            valueText("dashboard_tf_size");
        } else if (step.type === "calculate") {
            setting.addDropdown((dd) => {
                for (const op of CALC_OPS) dd.addOption(op, OP_SYMBOL[op]);
                dd.setValue(step.op ?? "mul").onChange((v) => {
                    step.op = v as CalcOp;
                    changed();
                });
            });
            valueText("dashboard_tf_value");
            setting.addText((txt) =>
                txt
                    .setPlaceholder(t("dashboard_tf_new_field"))
                    .setValue(step.newField ?? "")
                    .onChange((v) => {
                        // The new field becomes mappable at once; the step row keeps the caret.
                        step.newField = v || undefined;
                        this.renderChannels();
                        changed();
                    }),
            );
        } else if (step.type === "movingAverage") {
            valueText("dashboard_tf_window");
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
        this.onSubmit({ ...this.draft(), id: this.initial?.id ?? uuid() });
        this.close();
    }

    onClose(): void {
        if (this.previewFrame) window.cancelAnimationFrame(this.previewFrame);
        this.preview?.unload();
        this.preview = null;
        this.contentEl.empty();
    }
}
