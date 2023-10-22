import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { BackLinkHandler } from "./BackLinkHandler";
import {
  BacklinkComponentResult,
  BacklinkElement,
} from "./model/BackLinkTypes";
import { EditService, FileService } from "architecture/plugin";
import { WrappedActionBuilderProps } from "components/NoteBuilder";
import { BacklinkWrapper } from "./BackComponent";
import React from "react";
export class BackLinkAction extends CustomZettelAction {
  id = "backlink";
  stepHandler = new BackLinkHandler();

  public component(props: WrappedActionBuilderProps) {
    return <BacklinkWrapper {...props} />;
  }

  async execute(info: ExecuteInfo) {
    if (info.element.result) {
      await this.dynamicConstructor(info);
    } else {
      await this.defaultConstructor(info);
    }
  }

  private dynamicConstructor(info: ExecuteInfo) {
    const { element, note } = info;
    const { file, heading } = element.result as BacklinkComponentResult;
    console.log(file, heading);
  }

  private async defaultConstructor(info: ExecuteInfo) {
    const { element, note } = info;
    const {
      defaultFile,
      insertPattern = "{{wikilink}}",
      defaultHeading,
    } = element as BacklinkElement;
    // Insert

    const mdLink = `\n${insertPattern.replace(
      "{{wikilink}}",
      `[[${note.getTitle()}]]`
    )}\n`;

    if (defaultFile && defaultHeading) {
      const targetFile = await FileService.getFile(defaultFile);
      if (targetFile) {
        await EditService.instance(targetFile)
          .setContent(await FileService.getContent(targetFile))
          .insertBacklink(mdLink, defaultHeading)
          .save();
      }
    }
  }

  getIcon() {
    return "links-coming-in";
  }
  getLabel() {
    return "Backlinks";
  }
  public isBackground() {
    return true;
  }
}
