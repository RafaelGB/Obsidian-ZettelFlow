import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { AbstractStepModal } from "../AbstractStepModal";
import { StepTitleHandler } from "./StepTitleHandler";

export class CommunityInfoHandler extends AbstractHandlerClass<AbstractStepModal> {
    name = t('step_builder_optional_toggle_title');
    description = t('step_builder_optional_toggle_description');
    handle(modal: AbstractStepModal): AbstractStepModal {
        const { info } = modal;
        const { title, description, contentEl } = info;

        new Setting(contentEl)
            .setName("Title")
            .setDesc("Title of the installed step")
            .addText((text) => text
                .setPlaceholder("Title")
                .setValue(title || '')
                .onChange((value: string) => {
                    info.title = value;
                })
            );

        const descSetting = new Setting(contentEl)
            .setName("Description")
            .setDesc("Information about the installed step and its purpose")
            .addTextArea((text) => {
                text.inputEl.style.minWidth = "-webkit-fill-available";
                text.inputEl.rows = 4;
                text
                    .setPlaceholder("Description")
                    .setValue(description || '')
                    .onChange((value: string) => {
                        info.description = value;
                    })
            }
            );
        descSetting.settingEl.style.display = 'block';
        return this.goNext(modal);
    }

    public manageNextHandler() {
        this.nextHandler = new StepTitleHandler();
    }
}