import { t } from "architecture/lang";
import { SelectorElement } from "zettelkasten";
import { createRoot } from "react-dom/client";
import React from "react";
import { Setting } from "obsidian";
import { ActionSetting } from "architecture/api";
import { SelectorDnD } from "./components/selectordnd/SelectorDnD";

export const elementTypeSelectorSettings: ActionSetting = (
  contentEl,
  _,
  action
) => {
  const { zone, key, label } = action as SelectorElement;
  contentEl.createEl("h3", {
    text: t("step_builder_element_type_selector_title"),
  });
  contentEl.createEl("p", {
    text: t("step_builder_element_type_selector_description"),
  });

  new Setting(contentEl)
    .setName(t("step_builder_element_type_zone_title"))
    .setDesc(t("step_builder_element_type_zone_description"))
    .addDropdown((dropdown) => {
      dropdown
        .addOption(
          "frontmatter",
          t("step_builder_element_type_zone_frontmatter")
        )
        .addOption("body", t("step_builder_element_type_zone_body"))
        .addOption("context", t("step_builder_element_type_zone_context"))
        .setValue(zone !== undefined ? (zone as string) : "frontmatter")
        .onChange(async (value) => {
          action.zone = value;
        });
    });

  new Setting(contentEl)
    .setName(t("step_builder_element_type_key_title"))
    .setDesc(t("step_builder_element_type_key_description"))
    .addText((text) => {
      text.setValue(key || ``).onChange(async (value) => {
        action.key = value;
      });
    });

  new Setting(contentEl)
    .setName(t("step_builder_element_type_prompt_label_title"))
    .setDesc(t("step_builder_element_type_prompt_label_description"))
    .addText((text) => {
      text.setValue(label || ``).onChange(async (value) => {
        action.label = value;
      });
    });

  const root = createRoot(contentEl.createDiv());
  root.render(<SelectorDnD action={action} root={root} />);
};
