import { FatalError, ObsidianApi, log } from "architecture";
import { TypeService } from "architecture/typing";
import { FileService, FrontmatterService, blockSemaphore } from "architecture/plugin";
import moment from "moment";
import { NoteDTO } from "./model/NoteDTO";
import { ContentDTO } from "./model/ContentDTO";
import { actionsStore } from "architecture/api";
import { TFile } from "obsidian";
import { SelectorMenuModal } from "zettelkasten";
import { NoteBuilderStateActions } from "application/components/noteBuilder/typing";

export class Builder {
  public static default(): NoteBuilder {
    return new NoteBuilder();
  }
}

export class NoteBuilder {
  public context = {};
  public note: NoteDTO;
  public externalFns: Record<string, unknown>;
  private content: ContentDTO;
  private actions: NoteBuilderStateActions;
  constructor() {
    this.note = new NoteDTO();
    this.content = new ContentDTO();
  }

  public async build(modal: SelectorMenuModal, actions: NoteBuilderStateActions) {
    this.actions = actions;
    try {
      if (modal.isEditor()) {
        return await this.buildEditor(modal);
      } else {
        return await this.buildNewNote();
      }
    } catch (error) {
      this.content.reset();
      if (!modal.isEditor()) {
        const potentialFile = await FileService.getFile(this.note.getFinalPath(), false);
        // Check if the file was created and delete it
        if (potentialFile) {
          await FileService.deleteFile(potentialFile);
        }
      }
      throw error;
    }
  }

  private async buildEditor(modal: SelectorMenuModal) {
    const markdownView = modal.getMarkdownView();
    if (!markdownView) {
      throw new FatalError("Markdown view is undefined").setCode(FatalError.MARKDOWN_VIEW_UNDEFINED);
    }
    await this.buildNote();
    modal.onEditorBuild(this.content.get());

    // If the origin is a file, we need to process the frontmatter and post-process the file
    if (!modal.isEmbedded() && markdownView.file) {
      await FrontmatterService
        .instance(markdownView.file)
        .processFrontMatter(this.content);
      await this.postProcess(markdownView.file);
    }

    return markdownView.file ? markdownView.file.path : "Embedded note";
  }

  private async buildNewNote() {
    this.note.setTitle(this.buildFilename());
    await this.buildNote();
    await this.errorManagement();

    // Prevent the Folder Flows to be activated once the note is created in a folder with an automatic configuration
    blockSemaphore(2000);

    const generatedFile = await FileService.createFile(this.note.getFinalPath(), this.content.get(), false);

    await FrontmatterService
      .instance(generatedFile)
      .processFrontMatter(this.content);
    await this.postProcess(generatedFile);

    log.trace(`Built: title "${this.note.getTitle()}" in folder "${this.note.getTargetFolder()}". paths: ${this.note.getPaths()}, elements: ${this.note.getElements()}`)

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
  }

  private async manageElements() {
    log.debug(`Builder: ${this.note.getElements().size} elements to process`);
    for (const [, element] of this.note.getElements()) {
      log.trace(`Builder: processing element ${element.type}`);
      await actionsStore
        .getAction(element.type)
        .execute({ element, content: this.content, note: this.note, context: this.context, externalFns: this.externalFns });
      this.actions.pbFinishElement();
    }
  }

  private async postProcess(file: TFile) {
    for (const [, element] of this.note.getElements()) {
      log.trace(`Builder: processing element ${element.type}`);

      await actionsStore
        .getAction(element.type)
        .postProcess({ element, content: this.content, note: this.note, context: this.context, externalFns: this.externalFns }, file);
    }

    setTimeout(() => {
      ObsidianApi.executeCommandById('templater-obsidian:replace-in-file-templater');
    }, 1000);
  }

  private async errorManagement() {
    if (!this.note.getTitle()) {
      throw new FatalError("Note title is empty").setCode(FatalError.INVALID_TITLE);
    }
  }
}
