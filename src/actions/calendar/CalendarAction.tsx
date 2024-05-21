import { Action, CustomZettelAction, ExecuteInfo } from "architecture/api";
import { CalendarWrapper } from "./CalendarComponent";
import React from "react";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import { calendarSettings } from "./CalendarSettings";
import { t } from "architecture/lang";
import { TypeService } from "architecture/typing";
import moment from "moment";

export class CalendarAction extends CustomZettelAction {
  private static ICON = "calendar-days";
  id = "calendar";
  defaultAction: Action = {
    type: this.id,
    hasUI: true,
    id: this.id,
  };
  settings = calendarSettings;

  link = "https://rafaelgb.github.io/Obsidian-ZettelFlow/actions/Calendar";
  purpose = "Add a calendar (date/time) to your note.";

  component(props: WrappedActionBuilderProps) {
    return <CalendarWrapper {...props} />;
  }

  async execute(info: ExecuteInfo) {
    const { content, element, context } = info;
    const {
      result,
      key,
      zone,
      staticBehaviour,
      staticValue,
      enableTime,
      format,
    } = element;
    // If the result is date, apply the daily format
    const valueToSave = staticBehaviour ? staticValue : result;

    if (TypeService.isString(key) && TypeService.isDate(valueToSave)) {
      const defaultFormat = enableTime ? "YYYY-MM-DDTHH:mm:ss" : "YYYY-MM-DD";
      const formattedValue = moment(valueToSave).format(
        (format as string) || defaultFormat
      );
      switch (zone) {
        case "body":
          content.modify(key, formattedValue);
          break;
        case "context":
          context[key] = formattedValue;
          break;
        case "frontmatter":
        default:
          content.addFrontMatter({ [key]: formattedValue });
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
