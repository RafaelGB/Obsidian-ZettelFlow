import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import { TagsWrapper } from "./TagsComponent";
import React from "react";
import { t } from "architecture/lang";
import { tagsSettings } from "./TagsSettings";

export class TagsAction extends CustomZettelAction {
  private static ICON = "price-tag-glyph";
  id = "tags";
  defaultAction = {
    type: this.id,
    description: "Add tags to the note",
    hasUI: true,
    id: this.id,
  };

  settings = tagsSettings;

  link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/Tags";
  purpose = "Add Obsidian tags to the note.";

  component(props: WrappedActionBuilderProps) {
    return <TagsWrapper {...props} />;
  }

  async execute(info: ExecuteInfo) {
    const { content, element } = info;
    const { result, staticBehaviour, staticValue } = element;
    const valueToSave = staticBehaviour ? staticValue : result;
    content.addTags(valueToSave as string[]);
  }

  getIcon(): string {
    return TagsAction.ICON;
  }
  getLabel(): string {
    return t("type_option_tags");
  }
}
