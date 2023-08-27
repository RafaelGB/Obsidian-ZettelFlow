import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { RootToggleHandler } from "./RootToggleHandler";
import { StepBuilderModal } from "zettelkasten";

export class StepTitleHandler extends AbstractHandlerClass<StepBuilderModal>  {
    name = t('step_builder_step_title');
    description = t('step_builder_step_title_description');
    handle(modal: StepBuilderModal): StepBuilderModal {
        const { info } = modal;
        const { contentEl, filename } = info;
        const onChangePromise = (value: string) => {
            info.filename = value;
        };
        new Setting(contentEl)
            .setName(this.name)
            .setDesc(this.description)
            .addText(text => {

                text
                    .setValue(filename || ``)
                    .onChange(onChangePromise)
            });
        return this.goNext(modal);
    }
    public manageNextHandler(): void {
        this.nextHandler = new RootToggleHandler();
    }

}