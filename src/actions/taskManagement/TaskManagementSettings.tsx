import { ActionSetting } from "architecture/api";
import { t } from "architecture/lang";
import { Setting } from "obsidian";
import { TaskManagementElement } from "./typing";
import { FolderSuggest } from "architecture/settings";

export const taskManagementSettings: ActionSetting = (contentEl, _, action) => {
  const { initialFolder, regex, rollupHeader, prefix, suffix } =
    action as TaskManagementElement;

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
    .setName(t("step_builder_element_type_task_management_rollup_header_title"))
    .setDesc(
      t("step_builder_element_type_task_management_rollup_header_description")
    )
    .addText((text) => {
      text
        .setPlaceholder(
          t(
            "step_builder_element_type_task_management_rollup_header_placeholder"
          )
        )
        .setValue(rollupHeader)
        .onChange(async (value) => {
          if (value) {
            action.rollupHeader = value;
          } else {
            delete action.rollupHeader;
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
};
