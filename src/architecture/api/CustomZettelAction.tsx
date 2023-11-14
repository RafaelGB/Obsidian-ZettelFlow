import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import {
  Action,
  ActionSetting,
  ExecuteInfo,
  ICustomZettelAction,
} from "./typing";
import React from "react";

export abstract class CustomZettelAction implements ICustomZettelAction {
  public component(props: WrappedActionBuilderProps): JSX.Element {
    return <></>;
  }
  abstract id: string;
  abstract defaultAction: Partial<Action>;
  abstract settings: ActionSetting;
  abstract execute(info: ExecuteInfo): Promise<void>;
  abstract getIcon(): string;
  abstract getLabel(): string;
}
