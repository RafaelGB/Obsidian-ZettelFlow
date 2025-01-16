import { AbstractHandlerClass } from "architecture/patterns";
import { t } from "architecture/lang";
import { Root, createRoot } from "react-dom/client";
import { ActionsManagement } from "./components/actionsManagment/ActionsManagement";
import React from "react";
import { AbstractStepModal } from "../AbstractStepModal";

export class ActionManagementHandler extends AbstractHandlerClass<AbstractStepModal> {
  name = t("step_builder_action_selector_title");
  description = t("step_builder_action_selector_description");
  root: Root;
  handle(modal: AbstractStepModal): AbstractStepModal {
    const { info } = modal;
    const { contentEl } = info;
    this.root = createRoot(contentEl.createDiv());
    this.root.render(<ActionsManagement modal={modal} />);
    return this.goNext(modal);
  }

  postAction(): void {
    this.root.unmount();
    this.nextPostAction();
  }
}
