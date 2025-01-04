import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import React from "react";
import { t } from "architecture/lang";
import { TypeService } from "architecture/typing";
import { elementTypeDynamicSelectorSettings } from "./DynamicSelectorSettings";
import { DynamicSelectorWrapper } from "./DynamicSelectorComponent";
import { DynamicSelectorElement } from "zettelkasten/typing";
import { DynamicMultipleSelector } from "./components/MultipleSelectorComponent";

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
  // TODO: Translate this
  purpose =
    "Create a script/rule to generate multiple options to be selected from. The selected option will be added to the note.";

  component(props: WrappedActionBuilderProps) {
    const action = props.action as DynamicSelectorElement;
    const { multiple } = action;
    if (multiple) {
      return <DynamicMultipleSelector {...props} />;
    }
    return <DynamicSelectorWrapper {...props} />;
  }

  async execute(info: ExecuteInfo) {
    const { content, element, context } = info;
    const { key, zone, result } = element;
    if (!result) {
      return;
    }

    if (
      TypeService.isString(key) &&
      (TypeService.isArray<string>(result, "string") ||
        TypeService.isString(result))
    ) {
      switch (zone) {
        case "body":
          content.modify(key, result.toString());
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
    return t("type_option_dynamic_selector");
  }
}
