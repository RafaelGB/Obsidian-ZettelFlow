import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { WrappedActionBuilderProps } from "components/NoteBuilder";
import React from "react";
import { ElementTypeSelectorHandler } from "./ElementTypeSelectorHandler";
import { SelectorWrapper } from "./SelectorComponent";
import { t } from "architecture/lang";
import { TypeService } from "architecture/typing";

export class SelectorAction extends CustomZettelAction {
  stepHandler = new ElementTypeSelectorHandler();
  component(props: WrappedActionBuilderProps) {
    return <SelectorWrapper {...props} />;
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

  getLabel(): string {
    return t("type_option_selector");
  }
}
