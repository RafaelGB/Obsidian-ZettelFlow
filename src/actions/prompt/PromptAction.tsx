import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { WrappedActionBuilderProps } from "components/NoteBuilder";
import React from "react";
import { ElementTypePromptHandler } from "./ElementTypePromptHandler";
import { PromptWrapper } from "./PromptComponent";
import { t } from "architecture/lang";
import { TypeService } from "architecture/typing";

export class PromptAction extends CustomZettelAction {
  stepHandler = new ElementTypePromptHandler();
  component(props: WrappedActionBuilderProps) {
    return <PromptWrapper {...props} />;
  }

  async execute(info: ExecuteInfo) {
    const { content, element } = info;
    const { key } = element;
    if (TypeService.isString(key)) {
      content.addElement(element);
    }
  }
  getIcon() {
    return "prompt";
  }

  getLabel() {
    return t("type_option_prompt");
  }
}
