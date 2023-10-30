import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { backlinkSettings } from "./BackLinkSettings";
import {
  BacklinkComponentResult,
  BacklinkElement,
} from "./model/BackLinkTypes";
import { EditService, FileService } from "architecture/plugin";
import { BacklinkWrapper } from "./BackComponent";
import React from "react";
import { HeadingCache } from "obsidian";
import { NoteDTO } from "notes";
import { log } from "architecture";
import { WrappedActionBuilderProps } from "components/noteBuilder";
export class BackLinkAction extends CustomZettelAction {
  id = "backlink";
  defaultAction = {
    type: this.id,
  };
  settings = backlinkSettings;

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
    const { file, heading, regex } = element.result as BacklinkComponentResult;

    await this.insertHeading(regex, file, heading, note);
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
    if (!file) {
      log.error(`Target file is undefined for ${note.getTitle()}`);
      return;
    }

    if (!heading) {
      log.error(`Target heading is undefined for ${note.getTitle()}`);
      return;
    }

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
