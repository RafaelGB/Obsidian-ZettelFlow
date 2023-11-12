import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { StepBuilderModal } from "zettelkasten";
import { ChildrenHeaderHandler } from "./ChildrenHeaderHandler";

export class OptionalToggleHandler extends AbstractHandlerClass<StepBuilderModal>  {
    name = t('step_builder_optional_toggle_title');
    description = t('step_builder_optional_toggle_description');
    handle(modal: StepBuilderModal): StepBuilderModal {
        const { info } = modal;
        const { optional, root, contentEl } = info;
        // if is root, then it is not optional by default. Skip this step
        if (root) {
            return this.goNext(modal);
        }

        const onChangePromise = (value: boolean) => {
            info.optional = value;
        };
        new Setting(contentEl)
            .setName(this.name)
            .setDesc(this.description)
            .addToggle(toggle =>
                toggle
                    .setValue(optional ?? false)
                    .onChange(onChangePromise)
            );
        return this.goNext(modal);
    }

    public manageNextHandler() {
        this.nextHandler = new ChildrenHeaderHandler();
    }
}