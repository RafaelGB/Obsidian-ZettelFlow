import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { StepBuilderModal } from "zettelkasten";
import { actionsStore } from "architecture/api/store/ActionsStore";

export class ActionManagementHandler extends AbstractHandlerClass<StepBuilderModal>  {
    name = t('step_builder_action_selector_title');
    description = t('step_builder_action_selector_description');
    handle(modal: StepBuilderModal): StepBuilderModal {
        const { info } = modal;
        const { element, contentEl } = info;
        const possibleActions = actionsStore.getActionsKeys();
        let potentialActionType = possibleActions[0];
        // LEGACY COMPATIBILITY START
        if (!info.actions && element) {
            if (element.type !== "bridge") {
                info.actions = [element];
                delete info.element;
            } else {
                delete info.element;
            }
        }
        console.log(info.actions);
        // LEGACY COMPATIBILITY END


        info.actions.forEach(a => {
            const action = actionsStore.getAction(a.type);
            action.settings(modal, a);
        });

        // Add new actions
        new Setting(contentEl)
            .setName(this.name)
            .setDesc(this.description)
            .addDropdown(dropdown => {
                possibleActions.forEach(key => {
                    dropdown.addOption(key, actionsStore.getAction(key).getLabel());
                });
                dropdown
                    .onChange(async (value) => {
                        potentialActionType = value;

                    });
            })
            .addButton(button => {
                button
                    .setButtonText("Add action")
                    .setIcon("plus")
                    .setTooltip("Add action")
                    .onClick(() => {
                        const defaultInfo = actionsStore.getDefaultActionInfo(potentialActionType);
                        info.actions.push(defaultInfo);
                        modal.refresh();
                    });
            });
        return this.goNext(modal);
    }
}