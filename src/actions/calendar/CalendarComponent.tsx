import { WrappedActionBuilderProps } from "components/NoteBuilder";
import { Calendar } from "components/core";
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
