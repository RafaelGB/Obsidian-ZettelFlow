import { FinalNoteInfo, FinalNoteType } from "./model/FinalNoteModel";
import { log } from "architecture";
import { finalNoteType2FinalNoteInfo } from "./mappers/FinalNoteMapper";
import { SectionElement } from "zettelkasten";
import { TypeService } from "architecture/typing";
import { Notice } from "obsidian";
import { FileService, FrontmatterService, Literal } from "architecture/plugin";

export class Builder {
  public static init(finalNote: FinalNoteType): BuilderRoot {
    const info = finalNoteType2FinalNoteInfo(finalNote);
    return new BuilderRoot(info);
  }
}

export class BuilderRoot {
  constructor(private info: FinalNoteInfo) { }
  public setTitle(title: string): BuilderRoot {
    if (title) {
      this.info.title = title;
    }
    return this;
  }

  public addPath(path: string, pos: number): BuilderRoot {
    log.trace(`Builder: adding path ${path} at position ${pos}`);
    this.info.paths.set(pos, path);
    return this;
  }

  public addFrontMatter(frontmatter: Record<string, Literal>) {
    if (frontmatter) {
      // Check if there are tags
      if (frontmatter.tags) {
        this.addTags(frontmatter.tags);
        delete frontmatter.tags;
      }
      // Merge the rest of the frontmatter
      this.info.frontmatter = { ...this.info.frontmatter, ...frontmatter };
    }
  }

  public addElement(
    element: SectionElement,
    callbackResult: unknown,
    pos: number
  ) {
    this.info.elements.set(pos, {
      ...element,
      result: callbackResult,
    });
  }

  public async build(): Promise<void> {
    await this.buildNote();
    const normalizedFolder = this.info.targetFolder.endsWith(FileService.PATH_SEPARATOR)
      ? this.info.targetFolder.substring(0, this.info.targetFolder.length - 1)
      : this.info.targetFolder;
    const path = normalizedFolder
      .concat(FileService.PATH_SEPARATOR)
      .concat(this.info.title)
      .concat(FileService.MARKDOWN_EXTENSION);
    FileService.createFile(path, this.info.content)
      .then((file) => {
        FrontmatterService.instance(file)
          .processFrontMatter(this.info)
          .then(() => {
            new Notice("Note created");
          })
          .catch((error) => {
            log.error("Error while processing frontmatter: " + error);
            new Notice("Error while processing frontmatter: " + error);
          });
      })
      .catch((error) => {
        log.error("Error while creating a file: " + error);
        new Notice("Error while creating a file: " + error);
      });
  }

  private addTags(tag: Literal): BuilderRoot {
    if (!tag) return this;
    // Check if tag satisfies string
    if (TypeService.isString(tag)) {
      this.info.tags.push(tag);
      return this;
    }

    if (TypeService.isArray<string>(tag, "string")) {
      tag.forEach((t) => {
        this.info.tags.push(t);
      });
      return this;
    }
    return this;
  }

  private async addContent(content: string) {
    this.info.content = this.info.content.concat(content);
  }

  private async buildNote() {
    log.debug(`Builder: ${this.info.paths.size} paths to process`);
    for (const [, path] of this.info.paths) {
      log.trace(`Builder: processing path ${path}`);
      const file = await FileService.getFile(path);
      if (!file) continue;
      const service = FrontmatterService.instance(file);
      const frontmatter = service.getFrontmatter();
      if (TypeService.isObject(frontmatter)) {
        this.addFrontMatter(frontmatter);
      }
      this.addContent(await service.getContent());
    }
    await this.manageElements();
  }

  private async manageElements() {
    log.debug(`Builder: ${this.info.elements.size} elements to process`);
    for (const [, element] of this.info.elements) {
      log.trace(`Builder: processing element ${element.type}`);
      switch (element.type) {
        case "prompt": {
          this.addPrompt(element);
        }
      }
    }
  }

  private addPrompt(element: SectionElement) {
    const { result, key } = element;
    if (TypeService.isString(key)) {
      this.addFrontMatter({ [key]: result });
    }
  }
}
