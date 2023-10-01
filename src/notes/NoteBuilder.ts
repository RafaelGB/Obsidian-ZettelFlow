import { log } from "architecture";
import { TypeService } from "architecture/typing";
import { FileService, FrontmatterService } from "architecture/plugin";
import moment from "moment";
import { NoteDTO } from "./model/NoteDTO";
import { ContentDTO } from "./model/ContentDTO";
import { actionsStore } from "architecture/api";

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

    const path = this.info.getTargetFolder()
      .concat(FileService.PATH_SEPARATOR)
      .concat(this.buildFilename())
      .concat(FileService.MARKDOWN_EXTENSION);
    await this.buildNote(path);
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

  private async buildNote(path: string) {
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
    await this.manageElements(path);
  }

  private async manageElements(path: string) {
    log.debug(`Builder: ${this.info.getElements().size} elements to process`);
    for (const [, element] of this.info.getElements()) {
      log.trace(`Builder: processing element ${element.type}`);
      await actionsStore
        .getAction(element.type)
        .execute({ element, content: this.content, path, note: this.info });
    }
  }
}
