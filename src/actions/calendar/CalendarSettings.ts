import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { CalendarElement } from "zettelkasten";
import { ActionSetting } from "architecture/api";
import { PropertySuggest } from "architecture/settings";
import { ObsidianConfig } from "architecture/plugin";

export const calendarSettings: ActionSetting = (contentEl, modal, action) => {
    const { key, label, zone, enableTime } = action as CalendarElement;

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
                .addOption("context", t("step_builder_element_type_zone_context"))
                .setValue(zone !== undefined ? (zone as string) : "frontmatter")
                .onChange(async (value) => {
                    action.zone = value;
                });
        });

    new Setting(contentEl)
        .setName(t("step_builder_element_type_key_title"))
        .setDesc(t("step_builder_element_type_key_description"))
        .addSearch(search => {
            ObsidianConfig.getTypes().then(types => {
                new PropertySuggest(
                    search.inputEl,
                    types,
                    enableTime ? ["datetime"] : ["date"]
                );
                search
                    .setValue(key || ``)
                    .onChange(async (value) => {
                        action.key = value;
                    });
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
    // Toggle to enable time
    new Setting(contentEl)
        .setName(t("step_builder_element_type_calendar_toggle_time_title"))
        .setDesc(t("step_builder_element_type_calendar_toggle_time_description"))
        .addToggle(toggle => {
            toggle
                .setValue(enableTime)
                .onChange(async (value) => {
                    action.enableTime = value;
                    modal.refresh();
                });
        });

}