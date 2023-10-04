import { AbstractHandlerClass } from "architecture/patterns";
import { WrappedActionBuilderProps } from "components/NoteBuilder";
import { StepBuilderModal } from "zettelkasten";
import { ExecuteInfo } from "./model/CustomZettelActionTypes";
import React from "react";

interface ICustomZettelAction {
  id: string;
  component(props: WrappedActionBuilderProps): JSX.Element;
  stepHandler: AbstractHandlerClass<StepBuilderModal>;
  execute(info: ExecuteInfo): Promise<void>;
  getIcon(): string;
  getLabel(): string;
  isBackground(): boolean;
}
export abstract class CustomZettelAction implements ICustomZettelAction {
  public isBackground() {
    return false;
  }

  public component(props: WrappedActionBuilderProps): JSX.Element {
    return <></>;
  }
  abstract id: string;
  abstract stepHandler: AbstractHandlerClass<StepBuilderModal>;
  abstract execute(info: ExecuteInfo): Promise<void>;
  abstract getIcon(): string;
  abstract getLabel(): string;
}
