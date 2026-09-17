import { App, Modal, Setting } from "obsidian";
import { EditorView } from "@codemirror/view";
import { dispatchEditor } from "architecture/components/core";
import {
    CONDITION_FIELDS,
    CONDITION_EXAMPLES,
    sanityCheckCondition,
} from "architecture/plugin/events/conditionHelp";
import {
    CONDITION_OPERATORS,
    buildConditionExpression,
} from "architecture/plugin/events/conditionBuilder";
import { t } from "architecture/lang";
import { c } from "architecture";

type LocaleKey = Parameters<typeof t>[0];

/**
 * Guided condition editor (#258): a CodeMirror box pre-populated with the current expression,
 * live sanity-check feedback, the conditionHelp vocabulary and insert-ready examples.
 *
 * It edits an **expression**, not a place to store one. #427 moved the condition off the arrow
 * label and into the step that owns the exit, so the caller decides where the result lands — the
 * arrow popup, the step editor and the exit editor all reuse this same guided surface.
 */
export class ConditionEditorModal extends Modal {
    private expr: string;
    private editorView?: EditorView;
    private warningEl!: HTMLElement;

    constructor(app: App, initial: string, private onSave: (expression: string) => void) {
        super(app);
        this.expr = stripGate(initial);
    }

    onOpen(): void {
        this.setTitle(t("condition_editor_title"));
        const { contentEl } = this;

        // ── Code editor ──────────────────────────────────────────────────
        const editorEl = contentEl.createDiv();
        this.warningEl = contentEl.createEl("p", { cls: "zettelkasten-flow__condition-warning" });

        this.editorView = dispatchEditor(editorEl, this.expr, (update) => {
            if (update.docChanged) {
                this.expr = update.state.doc.toString();
                this.showSanity();
            }
        });

        // ── Guided builder (#235, #318 S5) ────────────────────────────────
        this.renderBuilder(contentEl);

        // ── Vocabulary table ──────────────────────────────────────────────
        const vocabHeading = contentEl.createEl("h6");
        vocabHeading.textContent = t("condition_editor_vocabulary_heading");
        const table = contentEl.createEl("table", { cls: "zettelkasten-flow__condition-vocab-table" });
        const thead = table.createEl("thead");
        const headerRow = thead.createEl("tr");
        headerRow.createEl("th", { text: "Field" });
        headerRow.createEl("th", { text: "Note" });
        const tbody = table.createEl("tbody");
        for (const field of CONDITION_FIELDS) {
            const row = tbody.createEl("tr");
            row.createEl("td").createEl("code", { text: field.accessor });
            row.createEl("td", { text: field.note });
        }

        // ── Examples ─────────────────────────────────────────────────────
        const examplesWithCondition = CONDITION_EXAMPLES.filter((e) => e.condition !== "");
        if (examplesWithCondition.length > 0) {
            const exHeading = contentEl.createEl("h6");
            exHeading.textContent = t("condition_editor_examples_heading");
            const exList = contentEl.createEl("ul", { cls: "zettelkasten-flow__condition-examples" });
            for (const example of examplesWithCondition) {
                const li = exList.createEl("li");
                li.createEl("code", { text: example.condition });
                const insertBtn = li.createEl("button", {
                    text: t("condition_editor_insert"),
                    cls: "zettelkasten-flow__condition-insert-btn",
                });
                insertBtn.addEventListener("click", () => this.setExpr(example.condition));
            }
        }

        // ── Save / Cancel ─────────────────────────────────────────────────
        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText(t("condition_editor_save"))
                    .setCta()
                    .onClick(() => {
                        this.onSave(this.expr.trim());
                        this.close();
                    })
            )
            .addButton((btn) =>
                btn.setButtonText(t("condition_editor_cancel")).onClick(() => this.close())
            );
    }

    /**
     * The guided composer: field · operator · value pickers that emit a valid expression via the pure
     * {@link buildConditionExpression}, so a non-programmer never types JS. A value-less operator hides
     * the value box; an invalid clause shows the builder's reason instead of writing broken code.
     */
    private renderBuilder(contentEl: HTMLElement): void {
        contentEl.createEl("h6", { text: t("condition_builder_heading") });
        const row = contentEl.createDiv({ cls: c("condition-builder") });

        let field = CONDITION_FIELDS[0]?.accessor ?? "";
        let operatorId = CONDITION_OPERATORS[0].id;
        let value = "";

        const fieldSelect = row.createEl("select", { cls: c("condition-builder-field") });
        fieldSelect.setAttribute("aria-label", t("condition_builder_field"));
        for (const f of CONDITION_FIELDS) fieldSelect.createEl("option", { value: f.accessor, text: f.accessor });
        fieldSelect.addEventListener("change", () => (field = fieldSelect.value));

        const opSelect = row.createEl("select", { cls: c("condition-builder-operator") });
        opSelect.setAttribute("aria-label", t("condition_builder_operator"));
        for (const op of CONDITION_OPERATORS) {
            opSelect.createEl("option", { value: op.id, text: t(`condition_op_${op.id}` as LocaleKey) });
        }

        const valueInput = row.createEl("input", { type: "text", cls: c("condition-builder-value") });
        valueInput.placeholder = t("condition_builder_value");
        valueInput.setAttribute("aria-label", t("condition_builder_value"));
        valueInput.addEventListener("input", () => (value = valueInput.value));

        const syncValueVisibility = () => {
            const op = CONDITION_OPERATORS.find((o) => o.id === opSelect.value);
            valueInput.toggleClass(c("is-hidden"), !(op?.takesValue ?? true));
        };
        opSelect.addEventListener("change", () => {
            operatorId = opSelect.value;
            syncValueVisibility();
        });
        syncValueVisibility();

        const addBtn = row.createEl("button", { text: t("condition_builder_insert"), cls: c("condition-builder-insert-btn") });
        addBtn.addEventListener("click", () => {
            const built = buildConditionExpression({ field, operator: operatorId, value });
            if (!built.ok || !built.expression) {
                this.warningEl.textContent = built.error ?? "";
                return;
            }
            this.setExpr(built.expression);
        });
    }

    /** Replace the editor's content (and `this.expr`) with `next`, then refresh the sanity feedback. */
    private setExpr(next: string): void {
        this.expr = next;
        const view = this.editorView;
        if (view) {
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
        }
        this.showSanity();
    }

    /** Show the current expression's sanity-check reason (or clear it when the expression is fine). */
    private showSanity(): void {
        const check = sanityCheckCondition(this.expr);
        this.warningEl.textContent = check.ok ? "" : (check.error ?? "");
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

/** An expression, whether it arrives bare or still wearing the legacy `if:` prefix. */
export function stripGate(raw: string | undefined): string {
    return (raw ?? "").replace(/^\s*if\s*:/i, "").trim();
}
