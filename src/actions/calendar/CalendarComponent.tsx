import { WrappedActionBuilderProps } from "components/noteBuilder";
import { Calendar } from "components/calendar";
import React from "react";

export function CalendarWrapper(props: WrappedActionBuilderProps) {
  const { callback } = props;
  return (
    <Calendar
      onConfirm={(value) => {
        callback(value);
      }}
    />
  );
}
