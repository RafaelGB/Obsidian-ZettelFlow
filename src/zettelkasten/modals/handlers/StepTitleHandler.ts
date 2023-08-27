import { AbstractHandlerClass } from "architecture/patterns";
import { StepBuilderInfo } from "../../model/StepBuilderInfoModel";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { RootToggleHandler } from "./RootToggleHandler";

export class StepTitleHandler extends AbstractHandlerClass<StepBuilderInfo>  {
    name = t('step_builder_step_title');
    description = t('step_builder_step_title_description');
    handle(info: StepBuilderInfo): StepBuilderInfo {
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
        return this.goNext(info);
    }
    public manageNextHandler(): void {
        this.nextHandler = new RootToggleHandler();
    }

}