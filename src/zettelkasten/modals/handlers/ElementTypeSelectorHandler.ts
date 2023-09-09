import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { StepBuilderModal, TypeOption } from "zettelkasten";
import { ElementTypePromptHandler } from "./ElementTypePromptHandler";

export class ElementTypeSelectorHandler extends AbstractHandlerClass<StepBuilderModal>  {
    name = t('step_builder_element_type_selector_title');
    description = t('step_builder_element_type_selector_description');
    handle(modal: StepBuilderModal): StepBuilderModal {
        const { info } = modal;
        const { element, contentEl } = info;
        const { type = "bridge" } = element;

        new Setting(contentEl)
            .setName(this.name)
            .setDesc(this.description)
            .addDropdown(dropdown => {
                dropdown.addOption('bridge', t('type_option_bridge'))
                    .addOption('prompt', t('type_option_prompt'))
                    .addOption('calendar', t('type_option_calendar'))
                    .setValue(type)
                    .onChange(async (value) => {
                        element.type = value as TypeOption;
                        modal.refresh();
                    });
            }
            );
        return this.goNext(modal);
    }

    public manageNextHandler(): void {
        this.nextHandler = new ElementTypePromptHandler()
    }
}