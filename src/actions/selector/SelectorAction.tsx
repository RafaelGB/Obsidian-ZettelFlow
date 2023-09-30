import { CustomZettelAction } from "architecture/api";
import { WrappedActionBuilderProps } from "components/NoteBuilder";
import { FinalElement } from "notes";
import React from "react";
import { ElementTypeSelectorHandler } from "./ElementTypeSelectorHandler";
import { SelectorWrapper } from "./SelectorComponent";
import { t } from "architecture/lang";

export class SelectorAction extends CustomZettelAction {
  component(props: WrappedActionBuilderProps) {
    return <SelectorWrapper {...props} />;
  }

  async action(element: FinalElement) {}

  getIcon() {
    return "prompt";
  }
  stepHandler() {
    return new ElementTypeSelectorHandler();
  }

  getLabel(): string {
    return t("type_option_selector");
  }
}
