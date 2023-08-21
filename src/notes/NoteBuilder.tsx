import { FinalNoteInfo, FinalNoteType } from "./model/FinalNoteModel";
import { log } from "architecture";
import { finalNoteType2FinalNoteInfo } from "./mappers/FinalNoteMapper";
import { FrontMatterService } from "notes";
import { ZettelFlowBase, ZettelFlowOptionMetadata } from "zettelkasten";
import { TypeService } from "architecture/typing";
import { Notice } from "obsidian";
import {
  ElementBuilder,
  NoteBuilderProps,
  NoteBuilderState,
} from "components/NoteBuilder";
import React from "react";
import { ElementBuilderProps } from "components/NoteBuilder/model/NoteBuilderModel";
import { FileService } from "architecture/plugin";

export const callbackRootBuilder =
  (
    state: Pick<NoteBuilderState, "actions" | "title">,
    info: NoteBuilderProps
  ) =>
  (selected: string) => {
    const { actions, title } = state;
    const { plugin } = info;
    const { settings } = plugin;
    const selectedSection = settings.rootSection[selected];

    const builder = Builder.init({
      title: title,
      targetFolder: selectedSection.targetFolder,
    });
    nextElement(state, builder, selectedSection, info);
    actions.setTargetFolder(selectedSection.targetFolder);
  };

export const callbackElementBuilder =
  (state: Pick<NoteBuilderState, "actions">, info: ElementBuilderProps) =>
  (selected: string) => {
    const { childen, builder } = info;
    const selectedElement = childen[selected];
    nextElement(state, builder, selectedElement, info);
  };

function nextElement(
  state: Pick<NoteBuilderState, "actions">,
  builder: BuilderRoot,
  selectedOption: ZettelFlowBase,
  info: NoteBuilderProps
) {
  const { actions } = state;
  const { modal } = info;
  builder.addFrontMatter(selectedOption.frontmatter);

  if (TypeService.exists(selectedOption.template)) {
    builder.addTemplate(selectedOption.template);
  }

  if (TypeService.recordIsEmpty(selectedOption.children)) {
    builder.build();
    modal.close();
  } else {
    const childrenHeader = selectedOption.childrenHeader;
    actions.setHeader({
      title: childrenHeader,
    });
    actions.setSectionElement(
      <ElementBuilder
        {...info}
        childen={selectedOption.children}
        builder={builder}
        key={`children-${childrenHeader}`}
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

  public addFrontMatter(frontmatter: Record<string, ZettelFlowOptionMetadata>) {
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

  public addTemplate(templatePath: string): BuilderRoot {
    this.info.templates.push(templatePath);
    return this;
  }

  public async build(): Promise<void> {
    // TODO: check if the folder exists and create it if not

    // TODO: create a note
    const content = await this.buildContent();
    const path = this.info.targetFolder + this.info.title + ".md";
    FileService.createFile(path, content)
      .then((file) => {
        FrontMatterService.processFrontMatter(file, this.info)
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

  private addTags(tag: ZettelFlowOptionMetadata): BuilderRoot {
    if (!tag) return this;
    // Check if tag satisfies string
    if (TypeService.isString(tag)) {
      this.info.tags.push(tag);
      return this;
    }

    if (TypeService.isArray(tag, String)) {
      tag.forEach((t) => {
        this.info.tags.push(t);
      });
      return this;
    }
    return this;
  }

  private async buildContent() {
    let content = "";
    for (const template of this.info.templates) {
      const templateFile = await FileService.getFile(template);
      if (TypeService.exists(templateFile)) {
        const templateContent = await FileService.getContent(templateFile);
        content = content.concat("\n").concat(templateContent);
      }
    }
    return content;
  }
}
