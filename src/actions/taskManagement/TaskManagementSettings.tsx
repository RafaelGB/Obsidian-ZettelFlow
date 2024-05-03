import { ActionSetting } from "architecture/api";
import { t } from "architecture/lang";
import { Setting } from "obsidian";
import { TaskManagementElement } from "./typing";
import { FolderSuggest, PropertySuggest } from "architecture/settings";
import { ObsidianConfig } from "architecture/plugin";
import { v4 as uuid4 } from "uuid";

export const taskManagementSettings: ActionSetting = (contentEl, _, action) => {
  const {
    initialFolder,
    regex,
    rolloverHeader,
    prefix,
    suffix,
    isContent,
    key,
    recursiveFolders = true,
  } = action as TaskManagementElement;

  new Setting(contentEl)
    .setName(t("step_builder_element_type_task_management_target_folder_title"))
    .setDesc(
      t("step_builder_element_type_task_management_target_folder_description")
    )
    .addSearch((cb) => {
      new FolderSuggest(cb.inputEl);
      cb.setPlaceholder("Example: path/to/folder")
        .setValue(initialFolder || "")
        .onChange((value: string) => {
          if (value) {
            action.initialFolder = value;
          } else {
            delete action.initialFolder;
          }
        });
    });

  new Setting(contentEl)
    .setName(
      t("step_builder_element_type_task_management_allow_recursive_title")
    )
    .setDesc(
      t("step_builder_element_type_task_management_allow_recursive_description")
    )
    .addToggle((toggle) => {
      toggle.setValue(recursiveFolders).onChange((value) => {
        action.recursiveFolders = value;
      });
    });
  if (action.recursiveFolders === undefined) {
    action.recursiveFolders = true;
  }

  new Setting(contentEl)
    .setName(t("step_builder_element_type_task_management_regex_title"))
    .setDesc(t("step_builder_element_type_task_management_regex_description"))
    .addText((text) => {
      text
        .setPlaceholder(
          t("step_builder_element_type_task_management_regex_placeholder")
        )
        .setValue(regex || "")
        .onChange(async (value) => {
          action.regex = value;
        });
    });

  new Setting(contentEl)
    .setName(
      t("step_builder_element_type_task_management_rollover_header_title")
    )
    .setDesc(
      t("step_builder_element_type_task_management_rollover_header_description")
    )
    .addText((text) => {
      text
        .setPlaceholder(
          t(
            "step_builder_element_type_task_management_rollover_header_placeholder"
          )
        )
        .setValue(rolloverHeader)
        .onChange(async (value) => {
          if (value) {
            action.rolloverHeader = value;
          } else {
            delete action.rolloverHeader;
          }
        });
    });

  new Setting(contentEl)
    .setName(t("step_builder_element_type_task_management_prefix_title"))
    .setDesc(t("step_builder_element_type_task_management_prefix_description"))
    .addText((text) => {
      text.setValue(prefix || "").onChange(async (value) => {
        action.prefix = value;
      });
    });

  new Setting(contentEl)
    .setName(t("step_builder_element_type_task_management_suffix_title"))
    .setDesc(t("step_builder_element_type_task_management_suffix_description"))
    .addText((text) => {
      text
        .setPlaceholder(
          t("step_builder_element_type_task_management_suffix_placeholder")
        )
        .setValue(suffix || "!")
        .onChange(async (value) => {
          action.suffix = value;
        });
    });

  if (action.suffix === undefined) {
    action.suffix = "!";
  }

  const keyElementId = uuid4();
  new Setting(contentEl)
    .setName(t("step_builder_element_type_task_management_is_content_title"))
    .setDesc(
      t("step_builder_element_type_task_management_is_content_description")
    )
    .addToggle((toggle) => {
      toggle.setValue(isContent || false).onChange(async (value) => {
        action.isContent = value;
        const keyElement = document.getElementById(keyElementId);
        if (keyElement) {
          keyElement.style.display = value ? "block" : "none";
        }
      });
    });

  const keyElement = new Setting(contentEl)
    .setName(t("step_builder_element_type_key_title"))
    .setDesc(t("step_builder_element_type_key_description"))
    .addSearch((search) => {
      ObsidianConfig.getTypes().then((types) => {
        new PropertySuggest(search.inputEl, types, ["text", "checkbox"]);
        search.setValue(key || ``).onChange(async (value) => {
          action.key = value;
        });
      });
    });
  keyElement.settingEl.id = keyElementId;
  if (!isContent) {
    keyElement.settingEl.style.display = "none";
  }
};
