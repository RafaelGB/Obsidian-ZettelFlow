import { FinalNoteInfo, FinalNoteType } from "./model/FinalNoteModel";
import { log } from "architecture";
import { finalNoteType2FinalNoteInfo } from "./mappers/FinalNoteMapper";
import { SectionElement, ZettelFlowBase } from "zettelkasten";
import { TypeService } from "architecture/typing";
import { Notice } from "obsidian";
import {
  ActionSelector,
  NoteBuilderProps,
  NoteBuilderState,
} from "components/NoteBuilder";
import React from "react";
import {
  ElementBuilderProps,
  ActionBuilderProps,
} from "components/NoteBuilder/model/NoteBuilderModel";
import { FileService, FrontmatterService, Literal } from "architecture/plugin";
import { ElementSelector } from "components/NoteBuilder/ElementSelector";

export const callbackRootBuilder =
  (
    state: Pick<NoteBuilderState, "actions" | "title">,
    info: NoteBuilderProps
  ) =>
  (selected: string) => {
    const { actions } = state;
    const { plugin } = info;
    const { settings } = plugin;
    const selectedSection = settings.rootSection[selected];
    const builder = Builder.init({
      targetFolder: selectedSection.targetFolder,
    }).setTitle(state.title);
    nextElement(state, builder, selectedSection, selected, info, 0);
    actions.setTargetFolder(selectedSection.targetFolder);
  };

export const callbackElementBuilder =
  (
    state: Pick<NoteBuilderState, "actions" | "title">,
    info: ElementBuilderProps,
    pos: number
  ) =>
  (selected: string) => {
    const { childen, builder } = info;
    const selectedElement = childen[selected];
    nextElement(state, builder, selectedElement, selected, info, pos);
  };

export const callbackActionBuilder =
  (
    state: Pick<NoteBuilderState, "actions" | "title">,
    info: ActionBuilderProps,
    pos: number
  ) =>
  (callbackResult: Literal) => {
    const { action, path, builder } = info;
    builder.addElement(action.element, callbackResult, pos);
    nextElement(state, builder, action, path, info, pos);
  };

function nextElement(
  state: Pick<NoteBuilderState, "actions" | "title">,
  builder: BuilderRoot,
  nextOption: ZettelFlowBase,
  currentPath: string,
  info: NoteBuilderProps,
  pos: number
) {
  const { actions, title } = state;
  const { modal } = info;
  if (nextOption.element.type !== "bridge" && !nextOption.element.triggered) {
    // Is an action
    nextOption.element.triggered = true;
    actions.setHeader({
      title: nextOption.element.label || `${nextOption.element.type} action`,
    });
    actions.setSectionElement(
      <ActionSelector
        {...info}
        action={nextOption}
        path={currentPath}
        builder={builder}
        key={`selector-action-${currentPath}`}
      />
    );
    return;
  }
  builder.addPath(currentPath, pos);
  delete nextOption.element.triggered;
  if (TypeService.recordHasMultipleKeys(nextOption.children)) {
    // Element Selector
    const childrenHeader = nextOption.childrenHeader;
    actions.setHeader({
      title: childrenHeader,
    });

    actions.setSectionElement(
      <ElementSelector
        {...info}
        childen={nextOption.children}
        builder={builder}
        key={`selector-children-${childrenHeader}`}
      />
    );
  } else if (TypeService.recordHasOneKey(nextOption.children)) {
    // Recursive call to nextElement with the only child
    const [key, action] = Object.entries(nextOption.children)[0];
    nextElement(state, builder, action, key, info, actions.incrementPosition());
  } else {
    // TODO: control empty title
    builder.setTitle(title);
    // Build and close modal
    builder.build();
    modal.close();
  }
}

export class Builder {
  public static init(finalNote: FinalNoteType): BuilderRoot {
    const info = finalNoteType2FinalNoteInfo(finalNote);
    return new BuilderRoot(info);
  }
}

export class BuilderRoot {
  constructor(private info: FinalNoteInfo) {}
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
    const path = this.info.targetFolder + this.info.title + ".md";
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
