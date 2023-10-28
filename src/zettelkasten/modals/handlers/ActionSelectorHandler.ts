import { AbstractHandlerClass } from "architecture/patterns";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { StepBuilderModal } from "zettelkasten";
import { actionsStore } from "architecture/api/store/ActionsStore";
import { Action } from "architecture/api";

export class ActionSelectorHandler extends AbstractHandlerClass<StepBuilderModal>  {
    name = t('step_builder_action_selector_title');
    description = t('step_builder_action_selector_description');
    handle(modal: StepBuilderModal): StepBuilderModal {
        const { info } = modal;
        const { element, contentEl, actions = [] } = info;
        let potentialActionType: string;
        // LEGACY COMPATIBILITY START
        if (element) {
            actions.push(element);
            delete info.element;
        }
        // LEGACY COMPATIBILITY END
        actions.forEach(a => {
            const action = actionsStore.getAction(a.type);
            action.settings(modal, a);
        });

        // Add new actions
        new Setting(contentEl)
            .setName(this.name)
            .setDesc(this.description)
            .addDropdown(dropdown => {
                actionsStore.getActionsKeys().forEach(key => {
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
                    .onClick(async () => {
                        actions.push({
                            type: potentialActionType,
                        });

                        modal.refresh();
                    });
            });
        this.configureActionHandlers(actions);
        return this.goNext(modal);
    }
    private configureActionHandlers(actions: Action[]) {
        // attach the fist action handler to this one and the rest in order
    }
}