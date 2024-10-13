import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { log } from "architecture";
import { checkboxSettings } from "./CheckboxSettings";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import { CheckboxWrapper } from "./CheckboxComponent";
import React from "react";
import { TypeService } from "architecture/typing";

export class CheckboxAction extends CustomZettelAction {
  private static ICON = "check-square";
  id = "checkbox";
  defaultAction = {
    type: this.id,
    hasUI: true,
    zone: "frontmatter",
    id: this.id,
  };

  settings = checkboxSettings;

  link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/Checkbox";
  // TODO: Translate this
  purpose = "Add a checkbox property. Works with boolean values.";
  component(props: WrappedActionBuilderProps) {
    return <CheckboxWrapper {...props} />;
  }

  async execute(info: ExecuteInfo) {
    const { element, context } = info;
    const { key, zone, result, staticBehaviour, staticValue } = element;
    const valueToSave = staticBehaviour ? staticValue : result;
    log.debug(`Checkbox action: ${key} ${zone} ${valueToSave}`);
    if (TypeService.isString(key) && TypeService.isBoolean(valueToSave)) {
      switch (zone) {
        case "body":
          info.content.modify(key, String(valueToSave));
          break;
        case "context":
          context[key] = valueToSave;
          break;
        case "frontmatter":
        default:
          info.content.addFrontMatter({ [key]: valueToSave });
      }
    }
  }

  getIcon(): string {
    return CheckboxAction.ICON;
  }

  getLabel(): string {
    return "Checkbox";
  }
}
