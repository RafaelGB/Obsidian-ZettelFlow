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
        let potentialActionType: string;
        // LEGACY COMPATIBILITY START
        if (element && element.type !== "bridge") {
            info.actions = [element];
            delete info.element;
        }
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
                        info.actions.push({
                            type: potentialActionType,
                        });

                        modal.refresh();
                    });
            });
        return this.goNext(modal);
    }
}