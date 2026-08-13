import { AbstractHandlerClass } from "architecture/patterns";
import { t } from "architecture/lang";
import { Root, createRoot } from "react-dom/client";
import { ActionsManagement } from "./components/actionsManagment/ActionsManagement";
import React from "react";
import { AbstractStepModal } from "../AbstractStepModal";
import { log } from "architecture";
import { c } from "architecture";

class ActionManagementErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean }
> {
    state = { hasError: false };
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    componentDidCatch(error: Error) {
        log.error("ActionsManagement crashed:", error);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className={c("actions-management-error")}>
                    <p>{t("actions_management_render_error")}</p>
                </div>
            );
        }
        return this.props.children;
    }
}

export class ActionManagementHandler extends AbstractHandlerClass<AbstractStepModal> {
  name = t("step_builder_action_selector_title");
  description = t("step_builder_action_selector_description");
  root: Root;
  handle(modal: AbstractStepModal): AbstractStepModal {
    const { info } = modal;
    const { contentEl } = info;
    this.root = createRoot(contentEl.createDiv());
    this.root.render(
      <ActionManagementErrorBoundary>
        <ActionsManagement modal={modal} />
      </ActionManagementErrorBoundary>
    );
    return this.goNext(modal);
  }

  postAction(): void {
    this.root.unmount();
    this.nextPostAction();
  }
}
