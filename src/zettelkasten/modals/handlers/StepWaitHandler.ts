import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { RootToggleHandler } from "./RootToggleHandler";
import { AbstractStepModal } from "../AbstractStepModal";

/**
 * Authors the WAIT block (#151): a toggle that pauses the workflow at this step for human
 * confirmation, plus an optional message shown on the prompt. Writes the additive `wait` marker on
 * the step (absent = no pause). The message is kept in a closure so enabling the toggle picks up
 * text typed beforehand.
 */
export class StepWaitHandler extends AbstractHandlerClass<AbstractStepModal> {
    name = t("step_builder_wait_name");
    description = t("step_builder_wait_desc");

    handle(modal: AbstractStepModal): AbstractStepModal {
        const { info } = modal;
        const { contentEl } = info;
        let message = info.wait?.message ?? "";
        const apply = (enabled: boolean) => {
            info.wait = enabled
                ? { mode: "confirm", ...(message ? { message } : {}) }
                : undefined;
        };

        new Setting(contentEl)
            .setName(this.name)
            .setDesc(this.description)
            .addToggle((toggle) =>
                toggle.setValue(info.wait !== undefined).onChange((value) => apply(value))
            );

        new Setting(contentEl)
            .setName(t("step_builder_wait_message_name"))
            .setDesc(t("step_builder_wait_message_desc"))
            .addText((text) =>
                text.setValue(message).onChange((value) => {
                    message = value.trim();
                    if (info.wait) apply(true);
                })
            );

        return this.goNext(modal);
    }

    public manageNextHandler(): void {
        this.nextHandler = new RootToggleHandler();
    }
}
