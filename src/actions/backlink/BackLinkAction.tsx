import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { backlinkSettings } from "./BackLinkSettings";
import { BacklinkComponentResult, BacklinkElement } from "./typing";
import { EditService, FileService } from "architecture/plugin";
import { BacklinkWrapper } from "./BackLinkComponent";
import React from "react";
import { HeadingCache, TFile } from "obsidian";
import { log } from "architecture";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
export class BackLinkAction extends CustomZettelAction {
  private static ICON = "links-coming-in";
  id = "backlink";
  defaultAction = {
    type: this.id,
    hasUI: true,
    id: this.id,
  };
  settings = backlinkSettings;

  link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/Backlink";
  // TODO: Translate this
  purpose = "Add a backlink of the in-building note to another note.";
  public component(props: WrappedActionBuilderProps) {
    return <BacklinkWrapper {...props} />;
  }

  async postProcess(info: ExecuteInfo, file: TFile) {
    if (info.element.result) {
      await this.dynamicConstructor(info, file);
    } else {
      await this.defaultConstructor(info, file);
    }
  }

  private async dynamicConstructor(info: ExecuteInfo, source: TFile) {
    const { element } = info;
    const { file, heading, regex } = element.result as BacklinkComponentResult;

    await this.insertHeading(regex, file, heading, source);
  }

  private async defaultConstructor(info: ExecuteInfo, source: TFile) {
    const { element } = info;
    const {
      defaultFile,
      insertPattern = "{{wikilink}}",
      defaultHeading,
    } = element as BacklinkElement;
    // Insert
    await this.insertHeading(
      insertPattern,
      defaultFile,
      defaultHeading,
      source
    );
  }

  private async insertHeading(
    insertPattern: string,
    file: string | undefined,
    heading: HeadingCache | undefined,
    source: TFile
  ) {
    if (!file) {
      log.error(`Target file is undefined for ${source.basename}`);
      return;
    }

    if (!heading) {
      log.error(`Target heading is undefined for ${source.basename}`);
      return;
    }

    const mdLink = `\n${insertPattern.replace(
      "{{wikilink}}",
      `[[${source.basename}]]`
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
    return BackLinkAction.ICON;
  }
  getLabel() {
    return "Backlinks";
  }
  public isBackground() {
    return true;
  }
}
