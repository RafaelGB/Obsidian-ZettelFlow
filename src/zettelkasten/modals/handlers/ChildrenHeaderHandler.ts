import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { ActionManagementHandler } from "./ActionManagementHandler";
import { AbstractStepModal } from "../AbstractStepModal";

export class ChildrenHeaderHandler extends AbstractHandlerClass<AbstractStepModal> {
    name = t('step_builder_children_header_title');
    description = t('step_builder_children_header_description');
    handle(modal: AbstractStepModal): AbstractStepModal {
        const { info } = modal;
        const { contentEl, childrenHeader, root } = info;
        // If is root, skip this step
        if (root) return this.goNext(modal);

        new Setting(contentEl)
            .setName(this.name)
            .setDesc(this.description)
            .addTextArea(text => {
                text
                    .setValue(childrenHeader || ``)
                    .onChange(value => {
                        info.childrenHeader = value;
                    })
            });

        return this.goNext(modal);
    }
    public manageNextHandler(): void {
        this.nextHandler = new ActionManagementHandler();
    }

}