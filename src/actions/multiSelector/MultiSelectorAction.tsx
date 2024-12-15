import {
  ActionSetting,
  CustomZettelAction,
  ExecuteInfo,
} from "architecture/api";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import React from "react";
import { t } from "architecture/lang";
import { TypeService } from "architecture/typing";

export class MultiSelectorAction extends CustomZettelAction {
  settings: ActionSetting;
  private static ICON = "list";
  id = "multi-selector";
  defaultAction = {
    type: this.id,
    hasUI: true,
    id: this.id,
    zone: "frontmatter",
  };
  //settings = null;

  link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/MultiSelector";
  // TODO: Translate this
  purpose =
    "This action allows you to select multiple values from a list of options. The selected values will be stored in the frontmatter, body, or context of the note.";

  component(props: WrappedActionBuilderProps) {
    return <></>;
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
    return MultiSelectorAction.ICON;
  }

  getLabel(): string {
    return t("type_option_multi_selector");
  }
}
