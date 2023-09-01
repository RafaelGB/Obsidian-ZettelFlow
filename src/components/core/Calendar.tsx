import React from "react";
import { CalendarType } from "./model/CalendarModel";

export function Calendar(info: CalendarType) {
  const { onKeyDown } = info;
  const [valueState, setValueState] = React.useState<string>("");
  return (
    <input
      value={valueState}
      type="date"
      name="calendar"
      className="metadata-input metadata-input-text mod-date"
      max={"9999-12-31"}
      onChange={(event) => {
        setValueState(event.target.value);
      }}
      onKeyDown={(event) => {
        onKeyDown(event.key, valueState || "");
      }}
    />
  );
}
