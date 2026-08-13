import { FatalError, ObsidianApi, log } from "architecture";
import { substituteContextTokens } from "./contextTokens";
import { TypeService } from "architecture/typing";
import { FileService, FrontmatterService, VaultStateManager } from "architecture/plugin";
import { NoteDTO } from "./model/NoteDTO";
import { ContentDTO } from "./model/ContentDTO";
import { actionsStore } from "architecture/api";
import { TFile, moment as obsidianMoment } from "obsidian";
import type MomentFn from "moment";
import { SelectorMenuModal } from "zettelkasten";
import { NoteBuilderStateActions } from "application/components/noteBuilder/typing";
import { runOnCreationActions } from "application/patterns/runOnCreationActions";

// Obsidian bundles moment and re-exports it, but types it as a namespace; cast to the
// callable moment signature (type-only import of 'moment' is allowed by the guidelines).
const moment = obsidianMoment as unknown as typeof MomentFn;

export class Builder {
  public static default(): NoteBuilder {
    return new NoteBuilder();
  }
}

export class NoteBuilder {
  public context = {};
  public note: NoteDTO;
  private content: ContentDTO;
  private actions: NoteBuilderStateActions;
  private modal: SelectorMenuModal | undefined;
  constructor() {
    this.note = new NoteDTO();
    this.content = new ContentDTO();
  }

  public async build(modal: SelectorMenuModal, actions: NoteBuilderStateActions) {
    this.modal = modal;
    this.actions = actions;
    if (modal.isEditor()) {
      return await this.buildEditor(modal);
    } else {
      return await this.buildNewNote();
    }
  }

  private async buildEditor(modal: SelectorMenuModal) {
    try {
      const markdownView = modal.getMarkdownView();
      if (!markdownView) {
        throw new FatalError("Markdown view is undefined").setCode(FatalError.MARKDOWN_VIEW_UNDEFINED);
      }
      await this.buildNote();

      modal.onEditorBuild(this.content.get(), this.content.getModifications());
      // If the origin is a file, we need to process the frontmatter and post-process the file
      if (!modal.isEmbedded() && markdownView.file) {
        await FrontmatterService
          .instance(markdownView.file)
          .processTypedFrontMatter(this.content);
        await this.postProcess(markdownView.file);
      }

      return markdownView.file ? markdownView.file.path : "Embedded note";
    } catch (error) {
      this.content.reset();
      throw error;
    } finally {
      VaultStateManager.INSTANCE.processFinished(this.note.getFinalPath());
    }
  }

  private async buildNewNote() {
    try {
      VaultStateManager.INSTANCE.freeze();
      this.note.setTitle(this.buildFilename());
      await this.buildNote();
      await this.errorManagement();

      const generatedFile = await FileService.createFile(this.note.getFinalPath(), this.content.get(), false);

      await FrontmatterService
        .instance(generatedFile)
        .processTypedFrontMatter(this.content);
      await this.postProcess(generatedFile);

      log.trace(`Built: title "${this.note.getTitle()}" in folder "${this.note.getTargetFolder()}". paths: ${JSON.stringify(this.note.getPaths())}, elements: ${JSON.stringify(this.note.getElements())}`)

      return generatedFile.path;
    } catch (error) {
      this.content.reset();
      const potentialFile = await FileService.getFile(this.note.getFinalPath(), false);
      // Check if the file was created and delete it
      if (potentialFile) {
        await FileService.deleteFile(potentialFile);
      }
      VaultStateManager.INSTANCE.defrost();
      throw error;
    } finally {
      // Enable other process
      VaultStateManager.INSTANCE.processFinished(this.note.getFinalPath());
    }
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
    this.applyContextTokens();
    await this.manageElements();
    await this.runOnCreation();
    this.appendConnectionLinks();
  }

  /**
   * Run the Knowledge Pattern on-creation actions (#170) collected from the walked steps, as a block,
   * after the note's structure is assembled and before the file is written — so their results land in
   * `content`. Best-effort per action, reusing the standard `execute(info)` pipeline.
   */
  private async runOnCreation(): Promise<void> {
    await runOnCreationActions(
      this.note.getOnCreation(),
      { content: this.content, note: this.note, context: this.context },
      (type) => actionsStore.getAction(type)
    );
  }

  /**
   * Appends the connection links chosen in the companion pane (#127) to the note body as
   * `[[wikilinks]]`, so authors can link before they file. No-op when none were chosen.
   */
  private appendConnectionLinks(): void {
    const links = this.note.getLinks();
    if (links.length === 0) return;
    const body = this.content.get();
    const wikilinks = links.map((link) => `[[${link}]]`).join("\n");
    const separator = body.length === 0 || body.endsWith("\n") ? "\n" : "\n\n";
    this.content.set(body.concat(separator, wikilinks, "\n"));
  }

  private applyContextTokens(): void {
    const sourceFile = this.modal?.getSourceFile();
    const sourceFrontmatter: Record<string, unknown> = sourceFile
      ? (ObsidianApi.globalApp().metadataCache.getFileCache(sourceFile)?.frontmatter ?? {})
      : {};
    const canvasName = this.modal?.getCanvasName() ?? "";
    const substituted = substituteContextTokens(this.content.get(), sourceFrontmatter, canvasName);
    this.content.set(substituted);
  }

  private async manageElements() {
    log.debug(`Builder: ${this.note.getElements().size} elements to process`);
    for (const [, element] of this.note.getElements()) {
      log.trace(`Builder: processing element ${element.type}`);
      await actionsStore
        .getAction(element.type)
        .execute({ element, content: this.content, note: this.note, context: this.context });
      this.actions.pbFinishElement();
    }
  }

  private async postProcess(file: TFile) {
    for (const [, element] of this.note.getElements()) {
      log.trace(`Builder: processing element ${element.type}`);

      await actionsStore
        .getAction(element.type)
        .postProcess({ element, content: this.content, note: this.note, context: this.context }, file);
    }

    // Only trigger Templater's replace-in-file if the plugin is actually installed — otherwise
    // this schedules a no-op command lookup on every note build.
    if (ObsidianApi.globalApp().plugins.getPlugin('templater-obsidian')) {
      window.setTimeout(() => {
        ObsidianApi.executeCommandById('templater-obsidian:replace-in-file-templater');
      }, 1000);
    }
  }

  private async errorManagement() {
    if (!this.note.getTitle()) {
      throw new FatalError("Note title is empty").setCode(FatalError.INVALID_TITLE);
    }
  }
}
