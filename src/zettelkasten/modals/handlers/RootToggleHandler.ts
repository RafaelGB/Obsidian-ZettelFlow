import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { TargetFolderSuggesterHandler } from "./TargetFolderSuggesterHandler";
import { AbstractStepModal } from "../AbstractStepModal";

export class RootToggleHandler extends AbstractHandlerClass<AbstractStepModal> {
    name = t('step_builder_root_toggle_title');
    description = t('step_builder_root_toggle_description');
    handle(modal: AbstractStepModal): AbstractStepModal {
        const { info } = modal;
        const { root, contentEl } = info;
        const onChangePromise = (value: boolean) => {
            if (value) {
                // If it is root, apply extra logic
                info.optional = false;
            }
            info.root = value;
            modal.refresh();
        };
        new Setting(contentEl)
            .setName(this.name)
            .setDesc(this.description)
            .addToggle(toggle =>
                toggle
                    .setValue(root)
                    .onChange(onChangePromise)
            );
        return this.goNext(modal);
    }

    public manageNextHandler() {
        this.nextHandler = new TargetFolderSuggesterHandler();
    }
}