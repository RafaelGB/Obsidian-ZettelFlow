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
            .setName(t("action_title_label"))
            .setDesc(t("action_title_description"))
            .addText((text) => text
                .setPlaceholder(t("action_title_label"))
                .setValue(title || '')
                .onChange((value: string) => {
                    info.title = value;
                })
            );

        const descSetting = new Setting(contentEl)
            .setName(t("action_description_label"))
            .setDesc(t("action_description_text"))
            .addTextArea((text) => {
                text.inputEl.style.minWidth = "-webkit-fill-available";
                text.inputEl.rows = 4;
                text
                    .setPlaceholder(t("action_description_label"))
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