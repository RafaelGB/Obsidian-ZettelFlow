import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { SelectorElement, StepBuilderModal } from "zettelkasten";

export class ElementTypeSelectorHandler extends AbstractHandlerClass<StepBuilderModal>  {
    name = t('step_builder_element_type_selector_title');
    description = t('step_builder_element_type_selector_description');
    handle(modal: StepBuilderModal): StepBuilderModal {
        const { info } = modal;
        const { element, contentEl } = info;
        const { type = "bridge" } = element;
        if (type === 'selector') {
            const { key, label, options = {} } = element as SelectorElement;
            contentEl.createEl('h3', { text: this.name });
            contentEl.createEl('p', { text: this.description });

            new Setting(contentEl)
                .setName(t("step_builder_element_type_key_title"))
                .setDesc(t("step_builder_element_type_key_description"))
                .addText(text => {
                    text
                        .setValue(key || ``)
                        .onChange(async (value) => {
                            element.key = value;
                        });
                });

            new Setting(contentEl)
                .setName(t("step_builder_element_type_prompt_label_title"))
                .setDesc(t("step_builder_element_type_prompt_label_description"))
                .addText(text => {
                    text
                        .setValue(label || ``)
                        .onChange(async (value) => {
                            element.label = value;
                        });
                });

            // Add Label of the options
            Object.entries(options).forEach(([key, value]) => {
                let optionKey = key;
                let optionValue = value;
                const optionSetting = new Setting(contentEl)
                    .setName(`frontmatter.${key}`)
                    .setDesc(`alias: ${value}`);
                optionSetting
                    .addText(text => {
                        text
                            .setValue(optionKey || ``)
                            .onChange(async (newKey) => {
                                optionSetting.setName(`frontmatter.${newKey}`);
                                options[newKey] = optionValue;
                                delete options[optionKey];
                                optionKey = newKey;
                            });
                    }).addText(text => {
                        text
                            .setValue(optionValue || ``)
                            .onChange(async (newValue) => {
                                options[optionKey] = newValue;
                                optionSetting.setDesc(`alias: ${newValue}`);
                                optionValue = newValue;
                            });
                    }).addButton(button => {
                        button
                            .setIcon("trash")
                            .setTooltip("Delete this option")
                            .onClick(async () => {
                                delete (info.element as SelectorElement).options[key];
                                modal.refresh();
                            });
                    });
            });

            // Add new option
            new Setting(contentEl)
                .addButton(button => {
                    button
                        .setIcon("plus")
                        .setTooltip("Add new option")
                        .onClick(async () => {
                            const length = Object.keys(options).length + 1;
                            if (!info.element.options) {
                                info.element.options = {};
                            }
                            (info.element as SelectorElement).options[`Option${length}`] = `Option ${length}`;
                            modal.refresh();
                        });
                });
        }
        return this.goNext(modal);
    }
}