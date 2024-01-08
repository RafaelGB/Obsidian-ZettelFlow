import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import React from "react";
import { promptSettings } from "./PromptSettings";
import { PromptWrapper } from "./PromptComponent";
import { t } from "architecture/lang";
import { TypeService } from "architecture/typing";
import { log } from "architecture";

export class PromptAction extends CustomZettelAction {
  private static ICON = "form-input";
  id = "prompt";
  defaultAction = {
    type: this.id,
    hasUI: true,
    id: this.id,
  };
  settings = promptSettings;
  component(props: WrappedActionBuilderProps) {
    return <PromptWrapper {...props} />;
  }

  async execute(info: ExecuteInfo) {
    const { element, context } = info;
    const { key, zone, result, staticBehaviour, staticValue } = element;
    const valueToSave = staticBehaviour ? staticValue : result;
    log.debug(`Prompt action: ${key} ${zone} ${valueToSave}`);
    if (TypeService.isString(key) && TypeService.isString(valueToSave)) {
      switch (zone) {
        case "body":
          info.content.modify(key, valueToSave);
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
  getIcon() {
    return PromptAction.ICON;
  }

  getLabel() {
    return t("type_option_prompt");
  }
}
