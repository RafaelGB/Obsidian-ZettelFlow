import { ActionSetting } from "architecture/api";
import { t } from "architecture/lang";

import { ViewUpdate } from "@codemirror/view";
import { CodeElement } from "./typing";
import { dispatchEditor } from "./editor/Dispatcher";

export const scriptSettings: ActionSetting = (contentEl, _, action) => {
  const scriptAction = action as CodeElement;
  const { code } = scriptAction;
  contentEl.createEl("h3", {
    text: t("step_builder_element_type_script_title"),
  });
  contentEl.createEl("p", {
    text: t("step_builder_element_type_script_description"),
  });
  const editorEl = contentEl.createDiv();
  editorEl.id = "script-editor";
  const handleEditorUpdate = (update: ViewUpdate) => {
    if (update.docChanged) {
      scriptAction.code = update.state.doc.toString();
    }
  };

  dispatchEditor(editorEl, code, handleEditorUpdate);
};
