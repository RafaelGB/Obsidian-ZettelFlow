import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { StepBuilderModal, TypeOption } from "zettelkasten";
import { ElementTypePromptHandler } from "./ElementTypePromptHandler";

export class ActionSelectorHandler extends AbstractHandlerClass<StepBuilderModal>  {
    name = t('step_builder_action_selector_title');
    description = t('step_builder_action_selector_description');
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
                    .addOption('selector', t('type_option_selector'))
                    .setValue(type)
                    .onChange(async (value) => {
                        element.type = value as TypeOption;
                        modal.refresh();
                    });
            }
            );
        if (type !== 'bridge') {
            const { zone } = element;
            new Setting(contentEl)
                .setName(t("step_builder_element_type_zone_title"))
                .setDesc(t("step_builder_element_type_zone_description"))
                .addDropdown(dropdown => {
                    dropdown
                        .addOption('frontmatter', t('step_builder_element_type_zone_frontmatter'))
                        .addOption('body', t('step_builder_element_type_zone_body'))
                        .setValue(zone !== undefined ? zone as string : 'frontmatter')
                        .onChange(async (value) => {
                            element.zone = value;
                        });
                });
        }

        return this.goNext(modal);
    }

    public manageNextHandler(): void {
        this.nextHandler = new ElementTypePromptHandler()
    }
}