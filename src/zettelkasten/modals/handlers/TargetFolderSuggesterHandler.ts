import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { StepBuilderModal } from "zettelkasten";
import { ElementTypeSelectorHandler } from "./ElementTypeSelectorHandler";
import { FolderSuggest } from "architecture/settings";

export class TargetFolderSuggesterHandler extends AbstractHandlerClass<StepBuilderModal>  {
    name = t('step_builder_target_folder_title');
    description = t('step_builder_target_folder_description');
    handle(modal: StepBuilderModal): StepBuilderModal {
        const { info } = modal;
        const { targetFolder, contentEl } = info;
        new Setting(contentEl)
            .setName(this.name)
            .setDesc(this.description)
            .addSearch((cb) => {
                new FolderSuggest(
                    cb.inputEl
                );
                cb.setPlaceholder("Example: path/to/folder")
                    .setValue(targetFolder || "")
                    .onChange((value: string) => {
                        if (value) {
                            info.targetFolder = value;
                        } else {
                            delete info.targetFolder;
                        }
                    });
            });

        return this.goNext(modal);
    }

    public manageNextHandler() {
        this.nextHandler = new ElementTypeSelectorHandler();
    }
}