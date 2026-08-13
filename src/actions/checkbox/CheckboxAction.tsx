import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { log } from "architecture";
import { t } from "architecture/lang";
import { checkboxSettings } from "./CheckboxSettings";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import { CheckboxWrapper } from "./CheckboxComponent";
import React from "react";
import { TypeService } from "architecture/typing";
import { checkboxSettingsReader } from "./CheckboxSettingsReader";

export class CheckboxAction extends CustomZettelAction {
  private static ICON = "check-square";
  id = "checkbox";
  category = "manipulation" as const;
  defaultAction = {
    type: this.id,
    hasUI: true,
    zone: "frontmatter",
    id: this.id,
  };

  settings = checkboxSettings;
  settingsReader = checkboxSettingsReader;
  link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/Checkbox";
  // TODO: Translate this
  get purpose(): string {
    return t("checkbox_purpose");
  }
  component(props: WrappedActionBuilderProps) {
    return <CheckboxWrapper {...props} />;
  }

  async execute(info: ExecuteInfo) {
    const { element, context } = info;
    const { key, zone, result, staticBehaviour, staticValue } = element;
    const valueToSave = staticBehaviour ? staticValue : result;
    log.debug(
      `Checkbox action: ${String(key)} ${String(zone)} ${String(valueToSave)}`
    );
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
