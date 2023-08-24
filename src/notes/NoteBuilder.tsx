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
    })
      .setTitle(state.title)
      .addPath(selected, 0);
    nextElement(state, builder, selectedSection, info);
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
    log.debug("Selected: " + selected);
    const selectedElement = childen[selected];
    builder.addPath(selected, pos);
    nextElement(state, builder, selectedElement, info);
  };

export const callbackActionBuilder =
  (
    state: Pick<NoteBuilderState, "actions" | "title">,
    info: ActionBuilderProps,
    pos: number
  ) =>
  (callbackResult: Literal) => {
    const { action, builder } = info;
    builder.addElement(action.element, callbackResult, pos);
    nextElement(state, builder, action, info);
  };

export function previousElement(
  state: Pick<NoteBuilderState, "actions">,
  builder: BuilderRoot,
  previousOption: ZettelFlowBase,
  info: NoteBuilderProps,
  pos: number
) {}

function nextBridge(
  state: Pick<NoteBuilderState, "actions" | "title">,
  builder: BuilderRoot,
  path: string,
  nextOption: ZettelFlowBase,
  info: NoteBuilderProps,
  pos: number
) {
  const { actions } = state;
  // TODO: increase pos at store
  actions.incrementPosition();
  builder.addPath(path, pos);
  // TODO: add path
  nextElement(state, builder, nextOption, info, pos + 1);
}

function nextElement(
  state: Pick<NoteBuilderState, "actions" | "title">,
  builder: BuilderRoot,
  nextOption: ZettelFlowBase,
  info: NoteBuilderProps,
  pos = 0
) {
  const { actions, title } = state;
  const { modal } = info;
  builder.setTitle(title);
  if (TypeService.recordIsEmpty(nextOption.children)) {
    builder.build();
    modal.close();
  } else if (TypeService.recordHasOneKey(nextOption.children)) {
    const [key, action] = Object.entries(nextOption.children)[0];
    if (!action.element.type || action.element.type === "bridge") {
      nextBridge(state, builder, key, action, info, pos);
    } else {
      actions.setSectionElement(
        <ActionSelector
          {...info}
          action={action}
          path={key}
          builder={builder}
          key={`selector-action-${key}`}
        />
      );
    }
    return;
  } else {
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
  public undoInfoFor(pos: number): BuilderRoot {
    this.info.paths.delete(pos);
    this.info.elements.delete(pos);
    return this;
  }

  public addPath(path: string, pos: number): BuilderRoot {
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
    for (const [, path] of this.info.paths) {
      const file = await FileService.getFile(path);
      if (!file) continue;
      const service = FrontmatterService.instance(file);
      const frontmatter = service.getFrontmatter();
      if (TypeService.isObject(frontmatter)) {
        this.addFrontMatter(frontmatter);
      }
      this.manageElements();
      this.addContent(await service.getContent());
    }
  }

  private async manageElements() {
    for (const [, element] of this.info.elements) {
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
