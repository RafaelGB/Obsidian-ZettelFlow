import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { FolderSuggest } from "architecture/settings";
import { OptionalToggleHandler } from "./OptionalToggleHandler";
import { AbstractStepModal } from "../AbstractStepModal";

export class TargetFolderSuggesterHandler extends AbstractHandlerClass<AbstractStepModal> {
    name = t('step_builder_target_folder_title');
    description = t('step_builder_target_folder_description');
    handle(modal: AbstractStepModal): AbstractStepModal {
        const { info } = modal;
        if (modal.builder === "editor") {
            return this.goNext(modal);
        }
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
        this.nextHandler = new OptionalToggleHandler();
    }
}