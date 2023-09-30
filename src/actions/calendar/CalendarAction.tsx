import { CustomZettelAction } from "architecture/api";
import { CalendarWrapper } from "./CalendarComponent";
import React from "react";
import { WrappedActionBuilderProps } from "components/NoteBuilder";
import { ContentDTO, FinalElement } from "notes";
import { ElementTypeCalendarHandler } from "./ElementTypeCalendarHandler";
import { t } from "architecture/lang";
import { TypeService } from "architecture/typing";

export class CalendarAction extends CustomZettelAction {
  private icon: string;
  component(props: WrappedActionBuilderProps) {
    return <CalendarWrapper {...props} />;
  }

  async execute(element: FinalElement, content: ContentDTO) {
    const { result, key } = element;
    if (TypeService.isString(key) && TypeService.isDate(result)) {
      content.addElement(element);
    }
  }

  getIcon() {
    return this.icon;
  }

  stepHandler = new ElementTypeCalendarHandler();

  getLabel() {
    return t("type_option_calendar");
  }
}
