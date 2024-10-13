import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import { CssClassesWrapper } from "./CssClassesComponent";
import React from "react";
import { t } from "architecture/lang";
import { cssclassesSettings } from "./CssClassesSettings";

export class CssClassesAction extends CustomZettelAction {
  private static ICON = "view";
  id = "cssclasses";
  defaultAction = {
    type: this.id,
    description: "Css Classes",
    hasUI: true,
    id: this.id,
  };

  settings = cssclassesSettings;

  link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/CssClasses";
  // TODO: Translate this
  purpose =
    "Native Obsidian property to add CSS classes just for the note where it is added.";
  component(props: WrappedActionBuilderProps) {
    return <CssClassesWrapper {...props} />;
  }

  async execute(info: ExecuteInfo) {
    const { content, element } = info;
    const { result, staticBehaviour, staticValue } = element;
    const valueToSave = staticBehaviour ? staticValue : result;
    content.addFrontMatter({ cssclasses: valueToSave });
  }

  getIcon(): string {
    return CssClassesAction.ICON;
  }
  getLabel(): string {
    return t("type_option_cssclasses");
  }
}
