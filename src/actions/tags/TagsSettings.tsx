import { t } from "architecture/lang";
import { ActionSetting } from "architecture/api";
import { Setting } from "obsidian";
import { v4 as uuid4 } from "uuid";
import { TagsElement } from "zettelkasten";
import { createRoot } from "react-dom/client";
import React from "react";
import { SelectableSearch } from "architecture/components/core";
import { ObsidianApi } from "architecture";

export const tagsSettings: ActionSetting = (contentEl, _, action) => {
  const { staticBehaviour, staticValue } = action as TagsElement;
  contentEl.createEl("p", {
    text: t("step_builder_element_type_tags_description"),
  });

  // Toggle to enable static behaviour
  const dynamicId = uuid4();
  new Setting(contentEl)
    .setName(t("step_builder_element_type_static_toggle_title"))
    .setDesc(t("step_builder_element_type_static_toggle_description"))
    .addToggle((toggle) => {
      toggle.setValue(staticBehaviour).onChange(async (isStatic) => {
        action.staticBehaviour = isStatic;
        const staticInput = document.getElementById(
          dynamicId
        ) as HTMLInputElement;
        // find parent container with class 'setting-item' and hide it
        const parent: HTMLElement | null = staticInput.closest(".setting-item");
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

  const tagsRecord = ObsidianApi.metadataCache().getTags();
  const tags = Object.keys(tagsRecord).map((tag) => tag.substring(1));
  staticValueContainer.controlEl.id = dynamicId;
  const root = createRoot(staticValueContainer.controlEl);
  root.render(
    <SelectableSearch
      options={tags}
      initialSelections={staticValue}
      onChange={(tags) => {
        action.staticValue = tags;
      }}
      enableCreate={true}
    />
  );

  if (staticBehaviour) {
    staticValueContainer.settingEl.style.display = "flex";
  } else {
    staticValueContainer.settingEl.style.display = "none";
  }
};
