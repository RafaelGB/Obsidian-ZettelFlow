import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { t } from "architecture/lang";
import React from "react";
import { numberSettings } from "./NumberSettings";
import { log } from "architecture";
import { TypeService } from "architecture/typing";
import { NumberWrapper } from "./NumberComponent";

export class NumberAction extends CustomZettelAction {
  private static ICON = "binary";
  id = "number";

  defaultAction = {
    type: this.id,
    hasUI: true,
    id: this.id,
    zone: "frontmatter",
  };
  settings = numberSettings;

  link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/Number";
  // TODO: Translate this
  purpose = "Add a number property.";
  component(props: WrappedActionBuilderProps) {
    return <NumberWrapper {...props} />;
  }

  async execute(info: ExecuteInfo) {
    const { element, context } = info;
    const { key, zone, result, staticBehaviour, staticValue } = element;
    const valueToSave = staticBehaviour ? staticValue : result;
    log.debug(`Number action: ${key} ${zone} ${valueToSave}`);
    if (TypeService.isString(key) && TypeService.isNumber(valueToSave)) {
      switch (zone) {
        case "body":
          info.content.modify(key, valueToSave.toString());
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
    return NumberAction.ICON;
  }

  getLabel(): string {
    return t("type_option_number");
  }
}
