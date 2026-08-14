import { ActionSettingReader } from "architecture/api";
import { CodeElement, dispatchEditor } from "architecture/components/core";
import { t } from "architecture/lang";

const SCRIPT_VARIABLES = [
    { name: "note", type: "NoteDTO" },
    { name: "content", type: "ContentDTO" },
    { name: "app", type: "Obsidian App" },
    { name: "zf", type: "ZettelFlow script API" },
    { name: "context", type: "Record<string, Literal>" },
];

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
    for (const v of SCRIPT_VARIABLES) {
        const li = ul.createEl("li");
        const code = li.createEl("code");
        code.textContent = v.name;
        li.createSpan({ text: ` — ${v.type}` });
    }
};
