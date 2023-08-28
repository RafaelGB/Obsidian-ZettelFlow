import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { StepBuilderModal } from "zettelkasten";
import { TargetFolderSuggesterHandler } from "./TargetFolderSuggesterHandler";

export class RootToggleHandler extends AbstractHandlerClass<StepBuilderModal>  {
    name = t('step_builder_root_toggle_title');
    description = t('step_builder_root_toggle_description');
    handle(modal: StepBuilderModal): StepBuilderModal {
        const { info } = modal;
        const { isRoot, contentEl } = info;
        const onChangePromise = (value: boolean) => {
            info.isRoot = value;
            modal.refresh();
        };
        new Setting(contentEl)
            .setName(this.name)
            .setDesc(this.description)
            .addToggle(toggle =>
                toggle
                    .setValue(isRoot)
                    .onChange(onChangePromise)
            );
        return this.goNext(modal);
    }

    public manageNextHandler() {
        this.nextHandler = new TargetFolderSuggesterHandler();
    }
}