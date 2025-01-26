import { Action, ActionSetting } from "architecture/api";
import { t } from "architecture/lang";
import { ObsidianConfig } from "architecture/plugin";
import { PropertySuggest } from "architecture/settings";
import { Setting } from "obsidian";
import { CheckboxElement } from "zettelkasten";
import { v4 as uuid4 } from "uuid";
import { navbarAction } from "architecture/components/settings";

export const checkboxSettings: ActionSetting = (contentEl, modal, action) => {
    const name = t('step_builder_element_type_checkbox_title');
    const description = t('step_builder_element_type_checkbox_description');
    navbarAction(contentEl, name, description, action, modal);
    checkboxDetails(contentEl, action);
};

export const checkboxDetails = (contentEl: HTMLElement, action: Action, readonly: boolean = false): void => {
    const { key, label, zone, staticBehaviour, staticValue = false } = action as CheckboxElement;
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
        .addSearch(search => {
            ObsidianConfig.getTypes().then(types => {
                new PropertySuggest(
                    search.inputEl,
                    types,
                    ["checkbox"]
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
        .setName(t("step_builder_element_type_prompt_label_title"))
        .setDesc(t("step_builder_element_type_prompt_label_description"))
        .addText(text => {
            text
                .setDisabled(readonly)
                .setValue(label || ``)
                .onChange(async (value) => {
                    action.label = value;
                });
        });

    // Toggle to enable static behaviour
    const dynamicId = uuid4();
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
        .addToggle(toggle => {
            toggle
                .setDisabled(readonly)
                .setValue(staticValue)
                .onChange(async (value) => {
                    action.staticValue = value;
                });
            toggle.toggleEl.id = dynamicId;
        });

    if (staticBehaviour) {
        staticValueContainer.settingEl.style.display = 'flex';
    } else {
        staticValueContainer.settingEl.style.display = 'none';
    }
};