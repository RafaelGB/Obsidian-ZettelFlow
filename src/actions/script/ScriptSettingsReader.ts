import { ActionSettingReader, SCRIPT_ACTION_BINDINGS } from "architecture/api";
import { CodeElement, dispatchEditor } from "architecture/components/core";
import { t } from "architecture/lang";

export const scriptSettingsReader: ActionSettingReader = (contentEl, action) => {
    const scriptAction = action as CodeElement;

    const editorEl = contentEl.createDiv();
    dispatchEditor(editorEl, scriptAction.code, (update) => {
        if (update.docChanged) {
            scriptAction.code = update.state.doc.toString();
        }
    });

    const details = contentEl.createEl("details");
    const summary = details.createEl("summary");
    summary.textContent = t("script_editor_available_vars_heading");
    const ul = details.createEl("ul");
    for (const binding of SCRIPT_ACTION_BINDINGS) {
        const li = ul.createEl("li");
        const code = li.createEl("code");
        code.textContent = binding.name;
        li.createSpan({ text: ` — ${binding.type}` });
    }
};
