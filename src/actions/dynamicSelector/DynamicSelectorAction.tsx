import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import React from "react";
import { t } from "architecture/lang";
import { TypeService } from "architecture/typing";
import { elementTypeDynamicSelectorSettings } from "./DynamicSelectorSettings";
import { DynamicSelectorWrapper } from "./DynamicSelectorComponent";

export class DynamicSelectorAction extends CustomZettelAction {
  private static ICON = "square-dashed-mouse-pointer";
  id = "dynamic-selector";
  defaultAction = {
    type: this.id,
    hasUI: true,
    id: this.id,
    zone: "frontmatter",
  };
  settings = elementTypeDynamicSelectorSettings;

  link =
    "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/DynamicSelector";
  purpose =
    "Create a script/rule to generate multiple options to be selected from. The selected option will be added to the note.";

  component(props: WrappedActionBuilderProps) {
    return <DynamicSelectorWrapper {...props} />;
  }

  async execute(info: ExecuteInfo) {
    const { content, element, context } = info;
    const { key, zone, result } = element;
    if (TypeService.isString(key) && TypeService.isString(result)) {
      switch (zone) {
        case "body":
          content.modify(key, result);
          break;
        case "context":
          context[key] = result;
          break;
        case "frontmatter":
        default:
          content.addFrontMatter({ [key]: result });
      }
    }
  }

  getIcon() {
    return DynamicSelectorAction.ICON;
  }

  getLabel(): string {
    // TODO: use translation
    return "";
  }
}
