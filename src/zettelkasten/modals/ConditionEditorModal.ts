import { App, Modal, Setting } from "obsidian";
import { Canvas, CanvasEdge } from "obsidian/canvas";
import { dispatchEditor } from "architecture/components/core";
import {
    CONDITION_FIELDS,
    CONDITION_EXAMPLES,
    sanityCheckCondition,
} from "architecture/plugin/events/conditionHelp";
import { t } from "architecture/lang";
import { log } from "architecture";

/**
 * Guided condition editor for ZettelFlow canvas edges (#258).
 * Opens a CodeMirror editor pre-populated with the current `if: <expr>` label,
 * shows live sanity-check feedback, displays the conditionHelp vocabulary and
 * insert-ready examples, then writes `if: <expr>` back to the edge on save.
 */
export class ConditionEditorModal extends Modal {
    private edge: CanvasEdge;
    private canvas: Canvas;
    private expr: string;

    constructor(app: App, edge: CanvasEdge, canvas: Canvas) {
        super(app);
        this.edge = edge;
        this.canvas = canvas;
        this.expr = (edge.label ?? "").replace(/^if:\s*/, "").trim();
    }

    onOpen(): void {
        this.setTitle(t("condition_editor_title"));
        const { contentEl } = this;

        // ── Code editor ──────────────────────────────────────────────────
        const editorEl = contentEl.createDiv();
        const warningEl = contentEl.createEl("p", { cls: "zettelkasten-flow__condition-warning" });

        dispatchEditor(editorEl, this.expr, (update) => {
            if (update.docChanged) {
                this.expr = update.state.doc.toString();
                const check = sanityCheckCondition(this.expr);
                warningEl.textContent = check.ok ? "" : (check.error ?? "");
            }
        });

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
                insertBtn.addEventListener("click", () => {
                    this.expr = example.condition;
                    warningEl.textContent = "";
                });
            }
        }

        // ── Save / Cancel ─────────────────────────────────────────────────
        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText(t("condition_editor_save"))
                    .setCta()
                    .onClick(() => {
                        const trimmed = this.expr.trim();
                        try {
                            this.edge.label = trimmed ? `if: ${trimmed}` : "";
                            this.canvas.requestSave();
                        } catch (err) {
                            log.error(err);
                        }
                        this.close();
                    })
            )
            .addButton((btn) =>
                btn.setButtonText(t("condition_editor_cancel")).onClick(() => this.close())
            );
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
