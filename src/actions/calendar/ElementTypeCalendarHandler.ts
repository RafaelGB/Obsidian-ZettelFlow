import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { CalendarElement, StepBuilderModal } from "zettelkasten";
import { Action } from "architecture/api";

export function calendarSettings(modal: StepBuilderModal, action: Action) {
    const { info } = modal;
    const { contentEl } = info;
    const { key, label, zone } = action as CalendarElement;
    const name = t('step_builder_element_type_calendar_title');
    const description = t('step_builder_element_type_calendar_description');
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
        .setName(t("step_builder_element_type_calendar_label_title"))
        .setDesc(t("step_builder_element_type_calendar_label_description"))
        .addText(text => {
            text
                .setValue(label || ``)
                .onChange(async (value) => {
                    action.label = value;
                });
        });
}