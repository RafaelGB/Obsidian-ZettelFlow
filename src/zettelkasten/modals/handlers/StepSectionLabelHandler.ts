import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { RootToggleHandler } from "./RootToggleHandler";
import { StepBuilderModal } from "zettelkasten";

export class StepSectionLabelHandler extends AbstractHandlerClass<StepBuilderModal>  {
    name = t('step_builder_section_label_title');
    description = t('step_builder_section_label_description');
    handle(modal: StepBuilderModal): StepBuilderModal {
        const { info } = modal;
        const { contentEl, label } = info;
        const onChangePromise = (value: string) => {
            info.label = value;
        };
        new Setting(contentEl)
            .setName(this.name)
            .setDesc(this.description)
            .addTextArea(text => {
                text
                    .setValue(label)
                    .onChange(onChangePromise)
                    .setPlaceholder(t('step_builder_section_label_placeholder'));
            });

        return this.goNext(modal);
    }
    public manageNextHandler(): void {
        this.nextHandler = new RootToggleHandler();
    }

}