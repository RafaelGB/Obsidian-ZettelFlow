import { AbstractHandlerClass } from "architecture/patterns";
import { StepBuilderInfo } from "../../model/StepBuilderInfoModel";
import { Setting } from "obsidian";
import { t } from "architecture/lang";

export class RootToggleHandler extends AbstractHandlerClass<StepBuilderInfo>  {
    name = t('step_builder_root_toggle_title');
    description = t('step_builder_root_toggle_description');
    handle(info: StepBuilderInfo): StepBuilderInfo {
        const { isRoot, contentEl } = info;
        const onChangePromise = (value: boolean) => {
            info.isRoot = value;
        };
        new Setting(contentEl)
            .setName(this.name)
            .setDesc(this.description)
            .addToggle(toggle =>
                toggle
                    .setValue(isRoot)
                    .onChange(onChangePromise)
            );
        return this.goNext(info);
    }
}