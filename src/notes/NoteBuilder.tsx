import { FinalNoteInfo, FinalNoteType } from "./model/FinalNoteModel";
import { log } from "architecture";
import { finalNoteType2FinalNoteInfo } from "./mappers/FinalNoteMapper";
import { SectionElement } from "zettelkasten";
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
import { WorkflowStep } from "config";

export const callbackRootBuilder =
  (
    state: Pick<NoteBuilderState, "actions" | "title">,
    info: NoteBuilderProps
  ) =>
  (selected: WorkflowStep) => {
    const { actions, title } = state;
    const { plugin } = info;
    const { settings } = plugin;
    const { nodes } = settings;
    const { id } = selected;
    const selectedSection = nodes[id];
    const builder = Builder.init({
      targetFolder: selectedSection.targetFolder || "/",
    }).setTitle(title);
    nextElement(state, builder, selected, info, 0);
    actions.setTargetFolder(selectedSection.targetFolder);
  };

export const callbackElementBuilder =
  (
    state: Pick<NoteBuilderState, "actions" | "title">,
    info: ElementBuilderProps,
    pos: number
  ) =>
  (selected: WorkflowStep) => {
    const { builder } = info;
    nextElement(state, builder, selected, info, pos);
  };

export const callbackActionBuilder =
  (
    state: Pick<NoteBuilderState, "actions" | "title">,
    info: ActionBuilderProps,
    pos: number
  ) =>
  (callbackResult: Literal) => {
    const { action, builder, actionStep } = info;
    builder.addElement(action.element, callbackResult, pos);
    nextElement(state, builder, actionStep, info, pos);
  };

function nextElement(
  state: Pick<NoteBuilderState, "actions" | "title">,
  builder: BuilderRoot,
  selected: WorkflowStep,
  info: NoteBuilderProps,
  pos: number
) {
  const { actions, title } = state;
  const { modal, plugin } = info;
  const { settings } = plugin;
  const { id, children } = selected;
  const selectedElement = settings.nodes[id];
  if (
    selectedElement.element.type !== "bridge" &&
    !selectedElement.element.triggered
  ) {
    // Is an action
    selectedElement.element.triggered = true;
    actions.setSectionElement(
      <ActionSelector
        {...info}
        action={selectedElement}
        actionStep={selected}
        builder={builder}
        key={`selector-action-${selectedElement.path}`}
      />
    );
    actions.setHeader({
      title:
        selectedElement.element.label ||
        `${selectedElement.element.type} action`,
    });
    return;
  }
  delete selectedElement.element.triggered;
  if (children && children.length > 1) {
    builder.addPath(selectedElement.path, pos);
    // Element Selector
    const childrenHeader = selectedElement.childrenHeader;
    actions.setSectionElement(
      <ElementSelector
        {...info}
        childen={children}
        builder={builder}
        key={`selector-children-${childrenHeader}`}
      />
    );
    actions.setHeader({
      title: childrenHeader,
    });
  } else if (children && children.length === 1) {
    builder.addPath(selectedElement.path, pos);
    nextElement(state, builder, children[0], info, actions.incrementPosition());
  } else {
    if (title) {
      builder.addPath(selectedElement.path, pos);
      builder.setTitle(title);
      // Build and close modal
      builder.build();
      modal.close();
    } else {
      actions.setInvalidTitle(true);
      new Notice("Title cannot be empty");
    }
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
    const normalizedFolder = this.info.targetFolder.endsWith("/")
      ? this.info.targetFolder.substring(0, this.info.targetFolder.length - 1)
      : this.info.targetFolder;
    const path = normalizedFolder
      .concat("/")
      .concat(this.info.title)
      .concat(".md");
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
