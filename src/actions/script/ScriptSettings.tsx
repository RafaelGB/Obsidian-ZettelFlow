import { ActionSetting } from "architecture/api";
import { t } from "architecture/lang";
import React from "react";
import { createRoot } from "react-dom/client";
import { CodeEditor } from "./components/CodeEditor";
import CodeMirror from "codemirror";

export const scriptSettings: ActionSetting = (contentEl, _, action) => {
  contentEl.createEl("h3", {
    text: t("step_builder_element_type_script_title"),
  });
  contentEl.createEl("p", {
    text: t("step_builder_element_type_script_description"),
  });
  CodeMirror;
  const root = createRoot(contentEl.createDiv());
  root.render(<CodeEditor action={action} root={root} />);
};
