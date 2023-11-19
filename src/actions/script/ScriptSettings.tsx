import { ActionSetting } from "architecture/api";
import { t } from "architecture/lang";
import React from "react";
import { createRoot } from "react-dom/client";
import { EditorWrapper } from "./components/EditorWrapper";

export const scriptSettings: ActionSetting = (contentEl, _, action) => {
  contentEl.createEl("h3", {
    text: t("step_builder_element_type_script_title"),
  });
  contentEl.createEl("p", {
    text: t("step_builder_element_type_script_description"),
  });
  const root = createRoot(contentEl.createDiv());
  root.render(<EditorWrapper action={action} root={root} />);
};
