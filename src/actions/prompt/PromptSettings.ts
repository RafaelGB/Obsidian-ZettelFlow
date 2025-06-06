import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { PromptElement } from "zettelkasten";
import { Action, ActionSetting } from "architecture/api";
import { ObsidianConfig } from "architecture/plugin";
import { PropertySuggest } from "architecture/settings";
import { v4 as uuid4 } from "uuid";
import { navbarAction } from "architecture/components/settings";

export const promptSettings: ActionSetting = (contentEl, modal, action, disableNavbar) => {
    const name = t('step_builder_element_type_prompt_title');
    const description = t('step_builder_element_type_prompt_description');
    navbarAction(contentEl, name, description, action, modal, disableNavbar);
    promptDetails(contentEl.createDiv(), action);
}

export function promptDetails(contentEl: HTMLElement, action: Action, readMode: boolean = false): void {
    const { key, label, placeholder, zone, staticBehaviour, staticValue } = action as PromptElement;
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
                .setDisabled(readMode)
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
                    ["text"]
                );
                search
                    .setValue(key || ``)
                    .setDisabled(readMode)
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
                .setValue(label || ``)
                .setDisabled(readMode)
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
                .setDisabled(readMode)
                .onChange(async (value) => {
                    action.placeholder = value;
                });
        });


    // Toggle to enable static behaviour
    const dynamicId = uuid4();
    new Setting(contentEl)
        .setName(t("step_builder_element_type_static_toggle_title"))
        .setDesc(t("step_builder_element_type_static_toggle_description"))
        .addToggle(toggle => {
            toggle
                .setValue(staticBehaviour)
                .setDisabled(readMode)
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
        .addTextArea(text => {
            text.setValue(staticValue || ``)
                .setDisabled(readMode)
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
