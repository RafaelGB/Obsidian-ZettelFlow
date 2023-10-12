import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { StepBuilderModal } from "zettelkasten";
import { actionsStore } from "architecture/api/store/ActionsStore";

export class ActionSelectorHandler extends AbstractHandlerClass<StepBuilderModal>  {
    name = t('step_builder_action_selector_title');
    description = t('step_builder_action_selector_description');
    handle(modal: StepBuilderModal): StepBuilderModal {
        const { info } = modal;
        const { element, contentEl } = info;
        const { type = "bridge" } = element;
        this.setActionHandler(type);
        new Setting(contentEl)
            .setName(this.name)
            .setDesc(this.description)
            .addDropdown(dropdown => {
                dropdown.addOption('bridge', t('type_option_bridge'));
                actionsStore.getActionsKeys().forEach(key => {
                    dropdown.addOption(key, actionsStore.getAction(key).getLabel());
                });
                dropdown
                    .setValue(type)
                    .onChange(async (value) => {
                        element.type = value;
                        this.setActionHandler(type);
                        modal.refresh();
                    });
            }
            );
        return this.goNext(modal);
    }

    private setActionHandler(actionId: string): void {
        if (actionId === 'bridge') {
            this.nextHandler = undefined;
        } else {
            this.nextHandler = actionsStore.getAction(actionId).stepHandler;
        }
    }
}