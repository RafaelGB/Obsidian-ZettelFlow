import { t } from "architecture/lang";
import { Action, ActionSetting } from "architecture/api";
import { Setting } from "obsidian";
import { v4 as uuid4 } from "uuid";
import { TagsElement } from "zettelkasten";
import { createRoot } from "react-dom/client";
import React from "react";
import { SelectableSearch } from "architecture/components/core";
import { ObsidianApi } from "architecture";
import { navbarAction } from "architecture/components/settings";

export const cssclassesSettings: ActionSetting = (
  contentEl,
  modal,
  action,
  disableNavbar
) => {
  const name = t("step_builder_element_type_cssclasses_title");
  const description = t("step_builder_element_type_cssclasses_description");
  navbarAction(contentEl, name, description, action, modal, disableNavbar);
};

export function cssClassesDetails(
  contentEl: HTMLElement,
  action: Action,
  readonly: boolean = false
): void {
  const { staticBehaviour, staticValue } = action as TagsElement;
  // Toggle to enable static behaviour
  const dynamicId = uuid4();
  new Setting(contentEl)
    .setName(t("step_builder_element_type_static_toggle_title"))
    .setDesc(t("step_builder_element_type_static_toggle_description"))
    .addToggle((toggle) => {
      toggle
        .setDisabled(readonly)
        .setValue(staticBehaviour)
        .onChange(async (isStatic) => {
          action.staticBehaviour = isStatic;
          const staticInput = document.getElementById(
            dynamicId
          ) as HTMLInputElement;
          // find parent container with class 'setting-item' and hide it
          const parent: HTMLElement | null =
            staticInput.closest(".setting-item");
          if (parent) {
            if (isStatic) {
              parent.style.display = "flex";
            } else {
              parent.style.display = "none";
              staticInput.value = "";
              delete action.staticValue;
            }
          }
          action.hasUI = !isStatic;
        });
    });

  const staticValueContainer = new Setting(contentEl)
    .setName(t("step_builder_element_type_static_value_title"))
    .setDesc(t("step_builder_element_type_static_value_description"));

  const cssclasses =
    ObsidianApi.metadataCache().getFrontmatterPropertyValuesForKey(
      "cssclasses"
    );

  staticValueContainer.controlEl.id = dynamicId;
  const root = createRoot(staticValueContainer.controlEl);
  root.render(
    <SelectableSearch
      disabled={readonly}
      options={cssclasses}
      initialSelections={staticValue}
      onChange={(cssclasses) => {
        action.staticValue = cssclasses;
      }}
      enableCreate={true}
    />
  );

  if (staticBehaviour) {
    staticValueContainer.settingEl.style.display = "flex";
  } else {
    staticValueContainer.settingEl.style.display = "none";
  }
}
