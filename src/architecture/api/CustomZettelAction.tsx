import { WrappedActionBuilderProps } from "components/noteBuilder";
import { StepBuilderModal } from "zettelkasten";
import { ExecuteInfo } from "./model/CustomZettelActionTypes";
import React from "react";
import { Literal } from "architecture/plugin";

export type Action = {
  type: string;
  header?: string;
  hasUI?: boolean;
  [key: string]: Literal;
};

export type ActionSetting = (props: StepBuilderModal, action: Action) => void;

interface ICustomZettelAction {
  id: string;
  component(props: WrappedActionBuilderProps): JSX.Element;
  settings: ActionSetting;
  execute(info: ExecuteInfo): Promise<void>;
  getIcon(): string;
  getLabel(): string;
}

export abstract class CustomZettelAction implements ICustomZettelAction {
  public component(props: WrappedActionBuilderProps): JSX.Element {
    return <></>;
  }
  abstract id: string;
  abstract defaultAction: Action;
  abstract settings: ActionSetting;
  abstract execute(info: ExecuteInfo): Promise<void>;
  abstract getIcon(): string;
  abstract getLabel(): string;
}
