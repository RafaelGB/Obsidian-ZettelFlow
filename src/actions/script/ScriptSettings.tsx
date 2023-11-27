import { ActionSetting } from "architecture/api";
import { t } from "architecture/lang";

import { EditorState } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
// Importa también las extensiones de lenguaje que necesitas, por ejemplo, para JavaScript
import { javascript } from "@codemirror/lang-javascript";
import { CodeElement } from "./typing";

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

  const codeEditor = new EditorView({
    state: EditorState.create({
      doc: code,
      extensions: [
        javascript(),
        // Listener to update the 'code' variable when the editor changes
        EditorView.updateListener.of(handleEditorUpdate),
      ],
    }),
    parent: editorEl,
  }).dispatch();
  /*
  const root = createRoot(contentEl.createDiv());
  root.render(<CodeEditorWrapper action={action} root={root} />);
  */
};
