import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { StepSectionLabelHandler } from "./StepSectionLabelHandler";
import { AbstractStepModal } from "../AbstractStepModal";

export class StepTitleHandler extends AbstractHandlerClass<AbstractStepModal> {
    name = t('step_builder_step_title');
    description = t('step_builder_step_title_description');
    handle(modal: AbstractStepModal): AbstractStepModal {
        const { info, mode } = modal;
        if (mode !== "create") {
            return this.goNext(modal);
        }

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
        this.nextHandler = new StepSectionLabelHandler();
    }

}