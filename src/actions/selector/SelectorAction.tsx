import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import React from "react";
import { elementTypeSelectorSettings } from "./SelectorSettings";
import { SelectorWrapper } from "./components/SelectorComponent";
import { t } from "architecture/lang";
import { TypeService } from "architecture/typing";
import { SelectorElement } from "zettelkasten";
import { MultipleSelector } from "./components/MultipleSelectorComponent";
import { Notice } from "obsidian";
import { selectorSettingsReader } from "./SelectorSettingsReader";

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
  settingsReader = selectorSettingsReader;
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
    // result could be a string or an array
    if (
      result &&
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
    } else {
      new Notice(`The result ${result} is not a string or an array of strings`);
    }
  }

  getIcon() {
    return SelectorAction.ICON;
  }

  getLabel(): string {
    return t("type_option_selector");
  }
}
