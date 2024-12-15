import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import React from "react";
import { elementTypeSelectorSettings } from "./SelectorSettings";
import { SelectorWrapper } from "./components/SelectorComponent";
import { t } from "architecture/lang";
import { TypeService } from "architecture/typing";
import { SelectorElement } from "zettelkasten";
import { MultipleSelector } from "./components/MultipleSelectorComponent";

export class SelectorAction extends CustomZettelAction {
  private static ICON = "square-mouse-pointer";
  id = "selector";
  defaultAction = {
    type: this.id,
    hasUI: true,
    id: this.id,
    zone: "frontmatter",
  };
  settings = elementTypeSelectorSettings;

  link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/Selector";
  purpose =
    "Create multiple options to select from and add the selected one to the note.";
  component(props: WrappedActionBuilderProps) {
    const action = props.action as SelectorElement;
    const { multiple } = action;

    if (multiple) {
      return <MultipleSelector {...props} />;
    }
    // If the action is not multiple, return the SelectorWrapper component
    return <SelectorWrapper {...props} />;
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
    return SelectorAction.ICON;
  }

  getLabel(): string {
    return t("type_option_selector");
  }
}
