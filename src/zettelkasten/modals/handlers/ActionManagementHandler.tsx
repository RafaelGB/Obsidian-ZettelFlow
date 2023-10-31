import { AbstractHandlerClass } from "architecture/patterns";
import { t } from "architecture/lang";
import { StepBuilderModal } from "zettelkasten";
import { actionsStore } from "architecture/api/store/ActionsStore";
import { Root, createRoot } from "react-dom/client";
import { ActionsManagement } from "./components/actionsManagment/ActionsManagement";
import React from "react";

export class ActionManagementHandler extends AbstractHandlerClass<StepBuilderModal> {
  name = t("step_builder_action_selector_title");
  description = t("step_builder_action_selector_description");
  root: Root;
  handle(modal: StepBuilderModal): StepBuilderModal {
    const { info } = modal;
    const { element, contentEl } = info;
    //const possibleActions = actionsStore.getActionsKeys();
    //let potentialActionType = possibleActions[0];
    // LEGACY COMPATIBILITY START
    if (!info.actions && element) {
      if (element.type !== "bridge") {
        info.actions = [element];
        delete info.element;
      } else {
        delete info.element;
      }
    }
    // LEGACY COMPATIBILITY END
    /*
    info.actions.forEach((a) => {
      const action = actionsStore.getAction(a.type);
      action.settings(modal, a);
    });

    // Add new actions
    new Setting(contentEl)
      .setName(this.name)
      .setDesc(this.description)
      .addDropdown((dropdown) => {
        possibleActions.forEach((key) => {
          dropdown.addOption(key, actionsStore.getAction(key).getLabel());
        });
        dropdown.onChange(async (value) => {
          potentialActionType = value;
        });
      })
      .addButton((button) => {
        button
          .setButtonText("Add action")
          .setIcon("plus")
          .setTooltip("Add action")
          .onClick(() => {
            const defaultInfo =
              actionsStore.getDefaultActionInfo(potentialActionType);
            info.actions.push(defaultInfo);
            modal.refresh();
          });
      });
*/
    this.root = createRoot(contentEl.createDiv());
    this.root.render(<ActionsManagement modal={modal} />);
    return this.goNext(modal);
  }
  postAction(): void {
    this.root.unmount();
    this.nextPostAction();
  }
}
