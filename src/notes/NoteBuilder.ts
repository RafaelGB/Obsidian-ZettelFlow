import { log } from "architecture";
import { AditionBaseElement, CalendarElement, PromptElement, SectionElement } from "zettelkasten";
import { TypeService } from "architecture/typing";
import { Notice } from "obsidian";
import { FileService, FrontmatterService } from "architecture/plugin";
import moment from "moment";
import { NoteDTO } from "./model/NoteDTO";
import { ContentDTO } from "./model/ContentDTO";

export class Builder {
  public static default(): NoteBuilder {
    return new NoteBuilder();
  }

}

export class NoteBuilder {
  public info;
  private content;
  constructor() {
    this.info = new NoteDTO();
    this.content = new ContentDTO();
  }

  public async build(): Promise<string> {
    log.trace(`Builder: building note ${this.info.getTitle()} in folder ${this.info.getTargetFolder()}. paths: ${this.info.getPaths()}, elements: ${this.info.getElements()}`)
    await this.buildNote();
    const path = this.info.getTargetFolder()
      .concat(FileService.PATH_SEPARATOR)
      .concat(this.buildFilename())
      .concat(FileService.MARKDOWN_EXTENSION);
    const generatedFile = await FileService.createFile(path, this.content.get(), false);

    await FrontmatterService
      .instance(generatedFile)
      .processFrontMatter(this.content);
    return generatedFile.path;
  }

  private buildFilename(): string {
    return this.info.hasPattern() ?
      moment()
        .format(this.info.getPattern())
        .concat(" - ")
        .concat(this.info.getTitle()) :
      this.info.getTitle()
  }

  private async buildNote() {
    log.debug(`Builder: ${this.info.getPaths().size} paths to process`);
    for (const [, path] of this.info.getPaths()) {
      log.trace(`Builder: processing path ${path}`);
      const file = await FileService.getFile(path);
      if (!file) continue;
      const service = FrontmatterService.instance(file);
      const frontmatter = service.getFrontmatter();
      if (TypeService.isObject(frontmatter)) {
        this.content.addFrontMatter(frontmatter);
      }
      this.content.add(await service.getContent());
    }
    await this.manageElements();
  }

  private async manageElements() {
    log.debug(`Builder: ${this.info.getElements().size} elements to process`);
    for (const [, element] of this.info.getElements()) {
      log.trace(`Builder: processing element ${element.type}`);
      switch (element.type) {
        case "selector" || "prompt": {
          this.addString(element);
          break;
        }
        case "calendar": {
          this.addDate(element);
          break;
        }
      }
    }
  }

  private addString(element: SectionElement) {
    const { key } = element as PromptElement;
    if (TypeService.isString(key)) {
      this.addElementInfo(element);
    }
  }

  private addDate(element: SectionElement) {
    const { result, key } = element as CalendarElement;
    if (TypeService.isString(key) && TypeService.isDate(result)) {
      this.addElementInfo(element);
    }
  }


  private addElementInfo(element: SectionElement) {
    const { result, key, zone } = element as AditionBaseElement;
    switch (zone) {
      case "frontmatter": {
        this.content.addFrontMatter({ [key]: result });
        break;
      }
      case "body": {
        this.content.modify(key, result as string);
        break;
      }
      default: {
        new Notice(`Builder: unknown zone ${zone} for key ${key}. Frontmatter will be applied by default`);
        this.content.addFrontMatter({ [key]: result });
        break;
      }
    }
  }
}
