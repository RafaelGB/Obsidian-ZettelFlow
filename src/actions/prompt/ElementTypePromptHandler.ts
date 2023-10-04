import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { PromptElement, StepBuilderModal } from "zettelkasten";

export class ElementTypePromptHandler extends AbstractHandlerClass<StepBuilderModal>  {
    name = t('step_builder_element_type_prompt_title');
    description = t('step_builder_element_type_prompt_description');
    handle(modal: StepBuilderModal): StepBuilderModal {
        const { info } = modal;
        const { element, contentEl } = info;
        const { type } = element;
        if (type === 'prompt') {
            element.isAction = true;
            const { key, label, placeholder } = element as PromptElement;
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

            new Setting(contentEl)
                .setName(t("step_builder_element_type_prompt_placeholder_title"))
                .setDesc(t("step_builder_element_type_prompt_placeholder_description"))
                .addTextArea(text => {
                    text
                        .setValue(placeholder || ``)
                        .onChange(async (value) => {
                            element.placeholder = value;
                        });
                });
        }

        return this.goNext(modal);
    }
}