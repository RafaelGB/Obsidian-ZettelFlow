import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { CalendarWrapper } from "./CalendarComponent";
import React from "react";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import { calendarSettings } from "./CalendarSettings";
import { t } from "architecture/lang";
import { TypeService } from "architecture/typing";

export class CalendarAction extends CustomZettelAction {
  private static ICON = "calendar-days";
  id = "calendar";
  defaultAction: Action = {
    type: this.id,
    hasUI: true,
    id: this.id,
  };
  settings = calendarSettings;

  component(props: WrappedActionBuilderProps) {
    return <CalendarWrapper {...props} />;
  }

  async execute(info: ExecuteInfo) {
    const { content, element, context } = info;
    const { result, key, zone, staticBehaviour, staticValue } = element;
    const valueToSave = staticBehaviour ? staticValue : result;
    if (TypeService.isString(key) && TypeService.isDate(valueToSave)) {
      switch (zone) {
        case "body":
          content.modify(key, valueToSave.toISOString());
          break;
        case "context":
          context[key] = valueToSave;
          break;
        case "frontmatter":
        default:
          content.addFrontMatter({ [key]: valueToSave });
      }
    }
  }

  getIcon() {
    return CalendarAction.ICON;
  }

  getLabel() {
    return t("type_option_calendar");
  }
}
