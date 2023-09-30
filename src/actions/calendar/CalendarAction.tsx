import { CustomZettelAction } from "architecture/api";
import { CalendarWrapper } from "./CalendarComponent";
import React from "react";
import { WrappedActionBuilderProps } from "components/NoteBuilder";
import { FinalElement } from "notes";
import { AbstractHandlerClass } from "architecture/patterns";
import { StepBuilderModal } from "zettelkasten";
import { ElementTypeCalendarHandler } from "./ElementTypeCalendarHandler";
import { t } from "architecture/lang";

export class CalendarAction extends CustomZettelAction {
  private icon: string;
  component(props: WrappedActionBuilderProps) {
    return <CalendarWrapper {...props} />;
  }
  async action(element: FinalElement) {}

  getIcon() {
    return this.icon;
  }

  stepHandler(): AbstractHandlerClass<StepBuilderModal> {
    return new ElementTypeCalendarHandler();
  }

  getLabel() {
    return t("type_option_calendar");
  }
}
