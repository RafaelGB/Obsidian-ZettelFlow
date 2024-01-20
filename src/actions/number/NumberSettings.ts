import { ActionSetting } from "architecture/api";
import { t } from "architecture/lang";
import { ObsidianConfig } from "architecture/plugin";
import { PropertySuggest } from "architecture/settings";
import { Setting } from "obsidian";
import { NumberElement } from "zettelkasten";
import { v4 as uuid4 } from "uuid";

export const numberSettings: ActionSetting = (contentEl, _, action) => {
    const { key, label, placeholder, zone, staticBehaviour, staticValue } = action as NumberElement;
    const name = t('step_builder_element_type_number_title');
    const description = t('step_builder_element_type_number_description');
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
                    ["number"]
                );
                search
                    .setValue(key || ``)
                    .onChange(async (value) => {
                        action.key = value;
                    });
            });

        });

    new Setting(contentEl)
        .setName(t("step_builder_element_type_number_label_title"))
        .setDesc(t("step_builder_element_type_number_label_description"))
        .addText(text => {
            text
                .setValue(label || ``)
                .onChange(async (value) => {
                    action.label = value;
                });
        });

    new Setting(contentEl)
        .setName(t("step_builder_element_type_number_placeholder_title"))
        .setDesc(t("step_builder_element_type_number_placeholder_description"))
        .addTextArea(text => {
            text
                .setValue(placeholder || ``)
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

    staticValueContainer.settingEl.createEl('input', {
        attr: {
            type: 'number',
            id: dynamicId,
        },
        cls: 'setting-item-input',
        value: staticValue || '',
    });

    staticValueContainer.settingEl.addEventListener('change', (event) => {
        const target = event.target as HTMLInputElement;
        action.staticValue = parseFloat(target.value);
    });

    if (staticBehaviour) {
        staticValueContainer.settingEl.style.display = 'flex';
    } else {
        staticValueContainer.settingEl.style.display = 'none';
    }
}