import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { WrappedActionBuilderProps } from "components/noteBuilder";
import React from "react";
import { promptSettings } from "./PromptSettings";
import { PromptWrapper } from "./PromptComponent";
import { t } from "architecture/lang";
import { TypeService } from "architecture/typing";
import { addIcon } from "obsidian";

export class PromptAction extends CustomZettelAction {
  private static ICON = "zettelflow-prompt-icon";
  id = "prompt";
  defaultAction = {
    type: this.id,
  };
  settings = promptSettings;
  constructor() {
    super();
    addIcon(
      PromptAction.ICON,
      `<g transform="translate(-10,-10) scale(0.23,0.25)" stroke="none" > <path d="M47 352 c-13 -15 -17 -39 -17 -114 0 -133 -8 -128 212 -128 216 0 208 -5 208 132 0 133 8 128 -212 128 -157 0 -177 -2 -191 -18z m368 -112 l0 -95 -175 0 -175 0 -3 84 c-2 46 -1 90 2 98 5 11 40 13 178 11 l173 -3 0 -95z" /> <path d="M90 185 c0 -8 7 -15 15 -15 8 0 15 7 15 15 0 8 -7 15 -15 15 -8 0 -15 -7 -15 -15z" /> <path d="M140 185 c0 -8 7 -15 15 -15 8 0 15 7 15 15 0 8 -7 15 -15 15 -8 0 -15 -7 -15 -15z" /> <path d="M190 185 c0 -8 7 -15 15 -15 8 0 15 7 15 15 0 8 -7 15 -15 15 -8 0 -15 -7 -15 -15z" /> </g>`
    );
  }
  component(props: WrappedActionBuilderProps) {
    return <PromptWrapper {...props} />;
  }

  async execute(info: ExecuteInfo) {
    const { content, element } = info;
    const { key, zone, result } = element;
    if (TypeService.isString(key) && TypeService.isString(result)) {
      switch (zone) {
        case "body":
          content.modify(key, result);
          break;
        case "frontmatter":
        default:
          content.addFrontMatter({ [key]: result });
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
