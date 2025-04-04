import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { CalendarElement } from "zettelkasten";
import { Action, ActionSetting } from "architecture/api";
import { PropertySuggest } from "architecture/settings";
import { ObsidianConfig } from "architecture/plugin";
import { v4 as uuid4 } from "uuid";
import { navbarAction } from "architecture/components/settings";

export const calendarSettings: ActionSetting = (contentEl, modal, action, disableNavbar) => {
    const name = t('step_builder_element_type_calendar_title');
    const description = t('step_builder_element_type_calendar_description');
    navbarAction(contentEl, name, description, action, modal, disableNavbar);
    calendarDetails(contentEl.createDiv(), action);
}

export function calendarDetails(contentEl: HTMLElement, action: Action, readonly: boolean = false): void {
    const {
        key, label, zone, enableTime, staticBehaviour, staticValue, format
    } = action as CalendarElement;

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
                .setDisabled(readonly)
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
                    .setDisabled(readonly)
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
                .setDisabled(readonly)
                .setValue(label || ``)
                .onChange(async (value) => {
                    action.label = value;
                });
        });

    // Toggle to enable time
    const dynamicId = uuid4();
    new Setting(contentEl)
        .setName(t("step_builder_element_type_calendar_toggle_time_title"))
        .setDesc(t("step_builder_element_type_calendar_toggle_time_description"))
        .addToggle(toggle => {
            toggle
                .setDisabled(readonly)
                .setValue(enableTime)
                .onChange(async (value) => {
                    action.enableTime = value;
                    delete action.format;
                    const input = document.getElementById(dynamicId);
                    if (input) {
                        input.setAttribute('type', value ? 'datetime-local' : 'date');
                    }
                });
        });

    // Format in function of the time is enabled or not
    new Setting(contentEl)
        .setName(t("step_builder_element_type_calendar_format_title"))
        .setDesc(t("step_builder_element_type_calendar_format_description"))
        .addText(text => {
            const placeholder = enableTime ? 'YYYY-MM-DDTHH:MM' : 'YYYY-MM-DD';
            text
                .setDisabled(readonly)
                .setValue(format || ``)
                .setPlaceholder(placeholder)
                .onChange(async (value) => {
                    action.format = value;
                });
        });

    // Toggle to enable static behaviour
    new Setting(contentEl)
        .setName(t("step_builder_element_type_static_toggle_title"))
        .setDesc(t("step_builder_element_type_static_toggle_description"))
        .addToggle(toggle => {
            toggle
                .setDisabled(readonly)
                .setValue(staticBehaviour)
                .onChange(async (isStatic) => {
                    action.staticBehaviour = isStatic;
                    const staticInput = document.getElementById(dynamicId) as HTMLInputElement;
                    // find parent container with class 'setting-item' and hide it
                    const parent: HTMLElement | null = staticInput.closest('.setting-item');
                    if (parent) {
                        if (isStatic) {
                            parent.style.display = 'flex';
                        } else {
                            parent.style.display = 'none';
                            staticInput.value = '';
                            delete action.staticValue;
                        }
                    }
                    action.hasUI = !isStatic;
                });
        });

    const staticValueContainer = new Setting(contentEl)
        .setName(t("step_builder_element_type_static_value_title"))
        .setDesc(t("step_builder_element_type_static_value_description"))
        .addText(text => {
            text.inputEl.type = enableTime ? 'datetime-local' : 'date';
            text
                .setDisabled(readonly)
                .setValue(staticValue || ``)
                .onChange(async (value) => {
                    action.staticValue = value;
                });
            text.inputEl.id = dynamicId;
        });
    if (staticBehaviour) {
        staticValueContainer.settingEl.style.display = 'flex';
    } else {
        staticValueContainer.settingEl.style.display = 'none';
    }
}