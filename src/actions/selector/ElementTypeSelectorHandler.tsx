import { t } from "architecture/lang";
import { SelectorElement, StepBuilderModal } from "zettelkasten";
import { createRoot } from "react-dom/client";
import React from "react";
import { Setting } from "obsidian";
import { Action } from "architecture/api";
import { SelectorDnD } from "./components/selectordnd/SelectorDnD";

export function elementTypeSelectorSettings(
  modal: StepBuilderModal,
  action: Action
) {
  const { info } = modal;
  const { contentEl } = info;
  const { zone, key, label } = action as SelectorElement;
  const name = t("step_builder_element_type_selector_title");
  const description = t("step_builder_element_type_selector_description");
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

  const elementSelectorChild = contentEl.createDiv();
  const root = createRoot(elementSelectorChild);
  root.render(<SelectorDnD action={action} root={root} />);
}
