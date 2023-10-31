import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { PromptElement } from "zettelkasten";
import { ActionSetting } from "architecture/api";

export const promptSettings: ActionSetting = (contentEl, _, action) => {
    const { key, label, placeholder, zone } = action as PromptElement;
    const name = t('step_builder_element_type_prompt_title');
    const description = t('step_builder_element_type_prompt_description');
    contentEl.createEl('h3', { text: name });
    contentEl.createEl('p', { text: description });

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
        .addText(text => {
            text
                .setValue(key || ``)
                .onChange(async (value) => {
                    action.key = value;
                });
        });

    new Setting(contentEl)
        .setName(t("step_builder_element_type_prompt_label_title"))
        .setDesc(t("step_builder_element_type_prompt_label_description"))
        .addText(text => {
            text
                .setValue(label || ``)
                .onChange(async (value) => {
                    action.label = value;
                });
        });

    new Setting(contentEl)
        .setName(t("step_builder_element_type_prompt_placeholder_title"))
        .setDesc(t("step_builder_element_type_prompt_placeholder_description"))
        .addTextArea(text => {
            text
                .setValue(placeholder || ``)
                .onChange(async (value) => {
                    action.placeholder = value;
                });
        });
}
