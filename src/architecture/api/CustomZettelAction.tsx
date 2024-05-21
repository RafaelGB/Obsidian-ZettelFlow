import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import {
  Action,
  ActionSetting,
  ExecuteInfo,
  ICustomZettelAction,
} from "./typing";
import React from "react";
import { TFile } from "obsidian";

export abstract class CustomZettelAction implements ICustomZettelAction {
  public component(props: WrappedActionBuilderProps): JSX.Element {
    return <></>;
  }
  abstract id: string;
  abstract defaultAction: Action;
  abstract settings: ActionSetting;
  abstract link: string;
  abstract purpose: string;
  async execute(_: ExecuteInfo) {
    // Do nothing by default
  }
  async postProcess(_: ExecuteInfo, __: TFile) {
    // Do nothing by default
  }
  abstract getIcon(): string;
  abstract getLabel(): string;
}
