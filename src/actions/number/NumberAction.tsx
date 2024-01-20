import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import {
  ActionSetting,
  CustomZettelAction,
  ExecuteInfo,
} from "architecture/api";
import { t } from "architecture/lang";
import React from "react";
import { numberSettings } from "./NumberSettings";

export class NumberAction extends CustomZettelAction {
  private static ICON = "pi-square";
  id = "number";

  defaultAction = {
    type: this.id,
    hasUI: true,
    id: this.id,
  };
  settings = numberSettings;

  component(props: WrappedActionBuilderProps) {
    return <></>;
  }

  async execute(info: ExecuteInfo) {}

  getIcon(): string {
    return NumberAction.ICON;
  }

  getLabel(): string {
    return t("type_option_number");
  }
}
