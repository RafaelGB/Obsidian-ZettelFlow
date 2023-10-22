import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { BackLinkHandler } from "./BackLinkHandler";
import {
  BacklinkComponentResult,
  BacklinkElement,
} from "./model/BackLinkTypes";
import { EditService, FileService } from "architecture/plugin";
import { WrappedActionBuilderProps } from "components/noteBuilder";
import { BacklinkWrapper } from "./BackComponent";
import React from "react";
import { HeadingCache } from "obsidian";
import { NoteDTO } from "notes";
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

  private async dynamicConstructor(info: ExecuteInfo) {
    const { element, note } = info;
    const { file, heading } = element.result as BacklinkComponentResult;
    const { insertPattern = "{{wikilink}}" } = element as BacklinkElement;

    await this.insertHeading(insertPattern, file, heading, note);
  }

  private async defaultConstructor(info: ExecuteInfo) {
    const { element, note } = info;
    const {
      defaultFile,
      insertPattern = "{{wikilink}}",
      defaultHeading,
    } = element as BacklinkElement;
    // Insert

    await this.insertHeading(insertPattern, defaultFile, defaultHeading, note);
  }

  private async insertHeading(
    insertPattern: string,
    file: string | undefined,
    heading: HeadingCache | undefined,
    note: NoteDTO
  ) {
    const mdLink = `\n${insertPattern.replace(
      "{{wikilink}}",
      `[[${note.getTitle()}]]`
    )}\n`;

    if (file && heading) {
      const targetFile = await FileService.getFile(file);
      if (targetFile) {
        await EditService.instance(targetFile)
          .setContent(await FileService.getContent(targetFile))
          .insertBacklink(mdLink, heading)
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
