/**
 * Author dashboard-level **computed fields** (epic #632) in the plugin's own CodeMirror `.js` editor
 * — the same surface the library and workbench use — with completions/hover for the offline
 * `DASHBOARD` bindings (`row`, `index`, `rows` + read-only `zf`). Off by default; the toggle's
 * description states it reads only, writes nothing and reaches no network.
 *
 * Everything the author needs is on this one screen (#632 UX):
 * - **How it works**, in three lines — once per note, return the new fields, missing in → empty out.
 * - **This Base's fields** as insertable chips, each with its type and how many notes carry it, since
 *   most fields are optional and that is what decides whether `row.x / 8` needs a default.
 * - `row.` **autocompletes** those same fields.
 * - **Preview** runs the code over the real notes (writes nothing) and shows the new columns, their
 *   inferred types and any note it skipped, and why — before you save.
 *
 * The editor is **lazily imported** so the view (and its tests) never pull CodeMirror in.
 */
import { Modal, Setting, setIcon } from "obsidian";
import type { App } from "obsidian";
import type { EditorView } from "@codemirror/view";
import { t, tCount } from "architecture/lang";
import { c } from "architecture/styles/helper";
import { DASHBOARD_BINDINGS } from "architecture/api/bindings/scriptBindings";
import { rowPath, type DataStoreSnapshot } from "dashboards/datastore";
import { rowKeys, type RowKey } from "dashboards/transform";
import type { ComputedFields } from "dashboards/panels";
import type { ComputedResolver } from "./scriptTransform";

const GUIDE_URL = "https://rafaelgb.github.io/Obsidian-ZettelFlow/development/base-dashboards/#computed-fields-advanced";
const PREVIEW_ROWS = 8;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** The minimal shape `dispatchEditor`'s `onChange` hands back — enough to read the edited text. */
interface EditorUpdate {
    state: { doc: { toString(): string } };
}

type LocaleKey = Parameters<typeof t>[0];

/** How a script reads a field: `row.hours`, or `row["my field"]` when the name is not an identifier. */
function accessor(key: string): string {
    return IDENTIFIER.test(key) ? `row.${key}` : `row[${JSON.stringify(key)}]`;
}

export class ComputedFieldsModal extends Modal {
    private enabled: boolean;
    private code: string;
    private bodyEl: HTMLElement | null = null;
    private previewEl: HTMLElement | null = null;
    private editor: EditorView | null = null;
    private readonly keys: RowKey[];
    /** Field id → how many notes carry a value for it. */
    private readonly carried = new Map<string, number>();

    constructor(
        app: App,
        private readonly base: DataStoreSnapshot,
        private readonly resolver: ComputedResolver,
        initial: ComputedFields | undefined,
        private readonly onSubmit: (computed: ComputedFields) => void,
    ) {
        super(app);
        this.enabled = initial?.enabled ?? false;
        this.code = initial?.code ?? "";
        this.keys = rowKeys(base.schema.fields);
        for (const field of base.schema.fields) {
            this.carried.set(field.id, base.rows.filter((row) => (row[field.id]?.kind ?? null) !== null).length);
        }
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.modalEl.addClass(c("base-dashboard-modal"));
        this.setTitle(t("dashboard_computed_section"));

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

        const footer = contentEl.createDiv({ cls: "modal-button-container" });
        footer.createEl("button", { text: t("dashboard_cancel") }).addEventListener("click", () => this.close());
        footer.createEl("button", { cls: "mod-cta", text: t("dashboard_save") }).addEventListener("click", () => {
            this.onSubmit({ enabled: this.enabled, code: this.code });
            this.close();
        });
    }

    private coverage(id: string): string {
        const carried = this.carried.get(id) ?? 0;
        return t("dashboard_computed_coverage", String(carried), String(this.base.rowCount));
    }

    /** A first script that works on *this* Base: its first number field, guarded by the null rule. */
    private starter(): string {
        const numeric = this.keys.find((key) => key.type === "number");
        const read = numeric ? accessor(numeric.key) : "row.hours";
        return [
            `// ${t("dashboard_computed_starter_once")}`,
            `// ${t("dashboard_computed_starter_missing")}`,
            "return {",
            `    score: ${read} / 8,`,
            "};",
            "",
        ].join("\n");
    }

    private renderBody(): void {
        const host = this.bodyEl;
        if (!host) return;
        host.empty();
        this.editor = null;
        if (!this.enabled) return;

        this.renderGuide(host);

        if (!this.code.trim()) this.code = this.starter();
        const editorHost = host.createDiv({ cls: c("base-dashboard-computed-editor") });
        void Promise.all([
            import("architecture/components/core/codeView/editor/Dispatcher"),
            import("./rowCompletion"),
        ]).then(([{ dispatchEditor }, { rowFieldCompletion }]) => {
            if (!editorHost.isConnected) return; // toggled off before the editor loaded
            const hints = this.keys.map((key) => ({ key: key.key, type: key.type, coverage: this.coverage(key.id) }));
            this.editor = dispatchEditor(
                editorHost,
                this.code,
                (update: EditorUpdate) => {
                    this.code = update.state.doc.toString();
                },
                DASHBOARD_BINDINGS,
                [rowFieldCompletion(hints)],
            );
        });

        new Setting(host)
            .setName(t("dashboard_preview"))
            .setDesc(t("dashboard_computed_preview_desc"))
            .addButton((btn) =>
                btn
                    .setButtonText(t("dashboard_computed_run"))
                    .setIcon("play")
                    .onClick(() => void this.runPreview()),
            );
        this.previewEl = host.createDiv({ cls: c("base-dashboard-computed-preview") });
    }

    /** Explain the contract in three lines and — since we know this Base — offer its fields. */
    private renderGuide(host: HTMLElement): void {
        const guide = host.createDiv({ cls: c("base-dashboard-computed-guide") });
        const steps = guide.createEl("ul", { cls: c("base-dashboard-computed-steps") });
        const lines: LocaleKey[] = ["dashboard_computed_guide_once", "dashboard_computed_guide_return", "dashboard_computed_guide_type"];
        for (const key of lines) steps.createEl("li", { text: t(key) });
        guide.createEl("a", { text: t("dashboard_computed_guide_link"), href: GUIDE_URL });

        guide.createDiv({ cls: c("base-dashboard-channel-label"), text: t("dashboard_computed_fields_label") });
        const list = guide.createDiv({ cls: c("base-dashboard-computed-fields") });
        for (const key of this.keys) {
            const carried = this.carried.get(key.id) ?? 0;
            const chip = list.createEl("button", {
                cls: c("base-dashboard-field-chip"),
                attr: { type: "button", "aria-label": t("dashboard_computed_insert", accessor(key.key)) },
            });
            chip.toggleClass("is-partial", carried < this.base.rowCount);
            chip.createSpan({ cls: c("base-dashboard-field-name"), text: key.key });
            chip.createSpan({ cls: c("base-dashboard-field-type"), text: key.type });
            chip.createSpan({ cls: c("base-dashboard-field-coverage"), text: `${carried}/${this.base.rowCount}` });
            chip.setAttribute("title", this.coverage(key.id));
            chip.addEventListener("click", () => this.insert(accessor(key.key)));
        }
    }

    /** Insert at the caret and hand focus back — a palette that steals the caret is one you stop using. */
    private insert(text: string): void {
        const editor = this.editor;
        if (!editor) return;
        const at = editor.state.selection.main.head;
        editor.dispatch({ changes: { from: at, insert: text }, selection: { anchor: at + text.length } });
        editor.focus();
    }

    /** Run the code in front of you over the real notes — in memory, nothing saved, nothing written. */
    private async runPreview(): Promise<void> {
        const host = this.previewEl;
        if (!host) return;
        host.empty();
        host.createDiv({ cls: c("base-dashboard-muted"), text: t("dashboard_computed_running") });
        const outcome = await this.resolver.evaluate(this.base, this.code);
        host.empty();

        if (!outcome.ok) {
            const error = host.createDiv({ cls: `${c("base-dashboard-notice")} is-error` });
            setIcon(error.createSpan({ cls: c("base-dashboard-notice-icon") }), "alert-circle");
            error.createSpan({ text: outcome.error });
            return;
        }
        if (outcome.added.length === 0) {
            host.createDiv({ cls: c("base-dashboard-muted"), text: t("dashboard_computed_none_added") });
            return;
        }

        const summary = host.createDiv({ cls: c("base-dashboard-computed-summary") });
        summary.createSpan({ text: tCount(outcome.added.length, "dashboard_computed_added", String(outcome.added.length)) });
        for (const field of outcome.added) {
            const chip = summary.createSpan({ cls: c("base-dashboard-field-chip") });
            chip.createSpan({ cls: c("base-dashboard-field-name"), text: field.name });
            chip.createSpan({ cls: c("base-dashboard-field-type"), text: field.type });
        }

        const wrap = host.createDiv({ cls: c("base-dashboard-table-wrap") });
        const table = wrap.createEl("table", { cls: c("base-dashboard-table") });
        const head = table.createEl("thead").createEl("tr");
        head.createEl("th", { text: t("dashboard_computed_note") });
        for (const field of outcome.added) head.createEl("th", { text: field.name });
        const body = table.createEl("tbody");
        for (const row of outcome.snapshot.rows.slice(0, PREVIEW_ROWS)) {
            const tr = body.createEl("tr");
            const path = rowPath(row) ?? "";
            tr.createEl("td", { text: (path.split("/").pop() ?? path).replace(/\.md$/, "") });
            for (const field of outcome.added) {
                const cell = row[field.id];
                const td = tr.createEl("td", { text: cell?.display || "—" });
                if (!cell || cell.kind === null) td.addClass(c("base-dashboard-muted"));
            }
        }
        if (outcome.snapshot.rowCount > PREVIEW_ROWS) {
            host.createDiv({
                cls: c("base-dashboard-muted"),
                text: tCount(outcome.snapshot.rowCount - PREVIEW_ROWS, "dashboard_computed_more_rows", String(outcome.snapshot.rowCount - PREVIEW_ROWS)),
            });
        }

        if (outcome.skipped > 0 || outcome.warnings.length > 0) {
            const notice = host.createDiv({ cls: c("base-dashboard-notice") });
            setIcon(notice.createSpan({ cls: c("base-dashboard-notice-icon") }), "alert-triangle");
            const text = notice.createDiv();
            if (outcome.skipped > 0) {
                text.createDiv({ text: tCount(outcome.skipped, "dashboard_computed_skipped_short", String(outcome.skipped)) });
            }
            const list = text.createEl("ul");
            for (const warning of outcome.warnings) {
                const where = warning.row === null ? "" : `${this.noteName(warning.row)}: `;
                list.createEl("li", { text: `${where}${warning.message}` });
            }
        }
    }

    private noteName(index: number): string {
        const row = this.base.rows[index];
        const path = row ? rowPath(row) ?? "" : "";
        return (path.split("/").pop() ?? path).replace(/\.md$/, "") || `#${index + 1}`;
    }

    onClose(): void {
        this.editor?.destroy();
        this.editor = null;
        this.contentEl.empty();
    }
}
