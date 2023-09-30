import { CustomZettelAction } from "architecture/api";
import { WrappedActionBuilderProps } from "components/NoteBuilder";
import { ContentDTO, FinalElement } from "notes";
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

  async execute(element: FinalElement, content: ContentDTO) {
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
