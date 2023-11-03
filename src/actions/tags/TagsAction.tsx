import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { WrappedActionBuilderProps } from "components/noteBuilder";
import { TagsWrapper } from "./TagsComponent";
import React from "react";
import { t } from "architecture/lang";
import { tagsSettings } from "./TagsSettings";

export class TagsAction extends CustomZettelAction {
  private static ICON = "price-tag-glyph:";
  id = "tags";
  defaultAction = {
    type: this.id,
  };
  settings = tagsSettings;

  component(props: WrappedActionBuilderProps) {
    return <TagsWrapper {...props} />;
  }

  async execute(info: ExecuteInfo) {
    const { content, element } = info;
    const { result } = element;
    content.addTags(result as string[]);
  }

  getIcon(): string {
    return TagsAction.ICON;
  }
  getLabel(): string {
    return t("type_option_tags");
  }
}
