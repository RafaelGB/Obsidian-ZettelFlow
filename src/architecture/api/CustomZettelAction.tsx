import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import {
  Action,
  ActionSetting,
  ActionSettingReader,
  ExecuteInfo,
  ICustomZettelAction,
} from "./typing";
import { ActionCategory } from "./categories";
import type { ActionKind } from "architecture/knowledge/taxonomy/actionKind";
import React, { JSX } from "react";
import { TFile } from "obsidian";

export abstract class CustomZettelAction implements ICustomZettelAction {
  public component(_props: WrappedActionBuilderProps): JSX.Element {
    return <></>;
  }
  abstract id: string;
  abstract defaultAction: Action;
  abstract settings: ActionSetting;
  abstract settingsReader: ActionSettingReader;
  abstract link: string;
  abstract purpose: string;
  /**
   * Optional cognitive-capability category (#152). Self-declared by the action; when absent the
   * action falls into the "uncategorized" picker group. Optional keeps third-party actions valid
   * without any change (#33).
   */
  category?: ActionCategory;
  /**
   * The Command/Query classification (#265, epic #262 Phase 3) — the primary taxonomy axis: a
   * `command` mutates knowledge, a `query` observes it. Optional so third-party actions stay valid;
   * every built-in declares one. `category` remains a validated facet alongside it.
   */
  kind?: ActionKind;
  async execute(_: ExecuteInfo) {
    // Do nothing by default
  }
  async postProcess(_: ExecuteInfo, __: TFile) {
    // Do nothing by default
  }
  abstract getIcon(): string;
  abstract getLabel(): string;
}
