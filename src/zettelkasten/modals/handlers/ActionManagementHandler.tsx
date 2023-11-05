import { AbstractHandlerClass } from "architecture/patterns";
import { t } from "architecture/lang";
import { StepBuilderModal } from "zettelkasten";
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
    // LEGACY COMPATIBILITY START
    if (element) {
      if (element.type !== "bridge") {
        info.actions = [element];
      }
      delete info.element;
    }
    // LEGACY COMPATIBILITY END
    this.root = createRoot(contentEl.createDiv());
    this.root.render(<ActionsManagement modal={modal} />);
    return this.goNext(modal);
  }

  postAction(): void {
    this.root.unmount();
    this.nextPostAction();
  }
}
