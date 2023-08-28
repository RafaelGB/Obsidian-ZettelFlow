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
            const { key, label, placeholder } = element as PromptElement;
            contentEl.createEl('h3', { text: this.name });
            contentEl.createEl('p', { text: this.description });
            new Setting(contentEl)
                .setName("Metadata Key")
                .setDesc("The key of the metadata to add to the frontmatter")
                .addText(text => {
                    text
                        .setValue(key || ``)
                        .onChange(async (value) => {
                            element.key = value;
                        });
                });

            new Setting(contentEl)
                .setName("Label of prompt")
                .setDesc("The label will be the title of your prompt")
                .addText(text => {
                    text
                        .setValue(label || ``)
                        .onChange(async (value) => {
                            element.label = value;
                        });
                });

            new Setting(contentEl)
                .setName("Placeholder of prompt")
                .setDesc("Helper text to display in the prompt")
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