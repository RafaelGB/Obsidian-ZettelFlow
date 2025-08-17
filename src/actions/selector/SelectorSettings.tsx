import { t } from "architecture/lang";
import { SelectorElement } from "zettelkasten";
import { createRoot } from "react-dom/client";
import React from "react";
import { Setting } from "obsidian";
import { Action, ActionSetting } from "architecture/api";
import { SelectorDnD } from "./components/selectordnd/SelectorDnD";
import { ObsidianNativeTypesManager } from "architecture/plugin";
import { PropertySuggest } from "architecture/settings";
import { navbarAction } from "architecture/components/settings";

export const elementTypeSelectorSettings: ActionSetting = (
  contentEl,
  modal,
  action,
  disableNavbar
) => {
  const name = t("step_builder_element_type_selector_title");
  const description = t("step_builder_element_type_selector_description");
  navbarAction(contentEl, name, description, action, modal, disableNavbar);
  selectorDetails(contentEl.createDiv(), action);
};

export function selectorDetails(
  contentEl: HTMLElement,
  action: Action,
  readonly: boolean = false
) {
  const { zone, key, label, multiple } = action as SelectorElement;

  new Setting(contentEl)
    .setName(t("step_builder_element_type_zone_title"))
    .setDesc(t("step_builder_element_type_zone_description"))
    .addDropdown((dropdown) => {
      dropdown
        .setDisabled(readonly)
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
    .addSearch((search) => {
      ObsidianNativeTypesManager.getTypes().then((types) => {
        new PropertySuggest(search.inputEl, types);
        search
          .setDisabled(readonly)
          .setValue(key || ``)
          .onChange(async (value) => {
            action.key = value;
          });
      });
    });

  new Setting(contentEl)
    .setName(t("step_builder_element_type_prompt_label_title"))
    .setDesc(t("step_builder_element_type_prompt_label_description"))
    .addText((text) => {
      text
        .setDisabled(readonly)
        .setValue(label || ``)
        .onChange(async (value) => {
          action.label = value;
        });
    });

  new Setting(contentEl)
    .setName(t("step_builder_element_type_selector_multiple_title"))
    .setDesc(t("step_builder_element_type_selector_multiple_description"))
    .addToggle((toggle) => {
      toggle
        .setDisabled(readonly)
        .setValue(multiple || false)
        .onChange(async (value) => {
          action.multiple = value;
        });
    });

  const root = createRoot(contentEl.createDiv());
  root.render(<SelectorDnD action={action} root={root} />);
}
