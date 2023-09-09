import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { StepBuilderModal } from "zettelkasten";
import { ElementTypeSelectorHandler } from "./ElementTypeSelectorHandler";

export class OptionalToggleHandler extends AbstractHandlerClass<StepBuilderModal>  {
    name = t('step_builder_optional_toggle_title');
    description = t('step_builder_optional_toggle_description');
    handle(modal: StepBuilderModal): StepBuilderModal {
        const { info } = modal;
        const { optional, contentEl } = info;
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
        this.nextHandler = new ElementTypeSelectorHandler();
    }
}