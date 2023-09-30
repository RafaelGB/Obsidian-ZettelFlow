import { CustomZettelAction } from "architecture/api";
import { WrappedActionBuilderProps } from "components/NoteBuilder";
import { FinalElement } from "notes";
import React from "react";
import { ElementTypePromptHandler } from "./ElementTypePromptHandler";
import { PromptWrapper } from "./PromptComponent";
import { t } from "architecture/lang";

export class PromptAction extends CustomZettelAction {
  component(props: WrappedActionBuilderProps) {
    return <PromptWrapper {...props} />;
  }

  async action(element: FinalElement) {}
  getIcon() {
    return "prompt";
  }

  getLabel() {
    return t("type_option_prompt");
  }

  stepHandler() {
    return new ElementTypePromptHandler();
  }
}
