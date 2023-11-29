import { ObsidianApi, log } from "architecture";
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
  public note;
  private content;
  constructor() {
    this.note = new NoteDTO();
    this.content = new ContentDTO();
  }

  public async build(): Promise<string> {
    log.trace(`Builder: building note ${this.note.getTitle()} in folder ${this.note.getTargetFolder()}. paths: ${this.note.getPaths()}, elements: ${this.note.getElements()}`)
    this.note.setTitle(this.buildFilename());
    await this.buildNote();
    const generatedFile = await FileService.createFile(this.note.getFinalPath(), this.content.get(), false);
    await FrontmatterService
      .instance(generatedFile)
      .processFrontMatter(this.content);
    return generatedFile.path;
  }

  private buildFilename(): string {
    return this.note.hasPattern() ?
      moment()
        .format(this.note.getPattern())
        .concat(" - ")
        .concat(this.note.getTitle()) :
      this.note.getTitle()
  }

  private async buildNote() {
    log.debug(`Builder: ${this.note.getPaths().size} paths to process`);
    for (const [, path] of this.note.getPaths()) {
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
    await this.postProcess();
  }

  private async manageElements() {
    log.debug(`Builder: ${this.note.getElements().size} elements to process`);
    for (const [, element] of this.note.getElements()) {
      log.trace(`Builder: processing element ${element.type}`);
      await actionsStore
        .getAction(element.type)
        .execute({ element, content: this.content, note: this.note });
    }
  }

  private async postProcess() {
    setTimeout(() => {
      ObsidianApi.executeCommandById('templater-obsidian:replace-in-file-templater');
    }, 1000);
  }
}
