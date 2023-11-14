import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import { Calendar } from "architecture/components/core";

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
