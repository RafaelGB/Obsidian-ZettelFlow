/**
 * Author dashboard-level **computed fields** (epic #632) in the plugin's own CodeMirror `.js` editor
 * — the same surface the library and workbench use — with completions/hover from the `zf` manifest
 * for the offline `DASHBOARD` bindings (`rows` + read-only `zf`). Off by default; a warning states it
 * reads only, writes nothing, and reaches no network.
 *
 * The editor is **lazily imported** so the Dashboard view (and its unit tests) never pull CodeMirror
 * into their module graph — it loads only when this modal is opened.
 */
import { Modal, Setting } from "obsidian";
import type { App } from "obsidian";
import { t } from "architecture/lang";
import { c } from "architecture/styles/helper";
import { DASHBOARD_BINDINGS } from "architecture/api/bindings/scriptBindings";
import type { ComputedFields } from "dashboards/panels";

/** The minimal shape `dispatchEditor`'s `onChange` hands back — enough to read the edited text. */
interface EditorUpdate {
    state: { doc: { toString(): string } };
}

export class ComputedFieldsModal extends Modal {
    private enabled: boolean;
    private code: string;
    private bodyEl: HTMLElement | null = null;

    constructor(
        app: App,
        initial: ComputedFields | undefined,
        private readonly onSubmit: (computed: ComputedFields) => void,
    ) {
        super(app);
        this.enabled = initial?.enabled ?? false;
        this.code = initial?.code ?? "";
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", { text: t("dashboard_computed_section") });

        new Setting(contentEl)
            .setName(t("dashboard_computed_enable"))
            .setDesc(t("dashboard_computed_warning"))
            .addToggle((tg) =>
                tg.setValue(this.enabled).onChange((on) => {
                    this.enabled = on;
                    this.renderBody();
                }),
            );

        this.bodyEl = contentEl.createDiv({ cls: c("base-dashboard-computed") });
        this.renderBody();

        new Setting(contentEl).addButton((btn) =>
            btn
                .setButtonText(t("dashboard_save"))
                .setCta()
                .onClick(() => {
                    this.onSubmit({ enabled: this.enabled, code: this.code });
                    this.close();
                }),
        );
    }

    private renderBody(): void {
        const host = this.bodyEl;
        if (!host) return;
        host.empty();
        if (!this.enabled) return;
        if (!this.code) this.code = t("dashboard_computed_placeholder");
        const editorHost = host.createDiv({ cls: c("base-dashboard-computed-editor") });
        void import("architecture/components/core/codeView/editor/Dispatcher").then(({ dispatchEditor }) => {
            dispatchEditor(
                editorHost,
                this.code,
                (update: EditorUpdate) => {
                    this.code = update.state.doc.toString();
                },
                DASHBOARD_BINDINGS,
            );
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
