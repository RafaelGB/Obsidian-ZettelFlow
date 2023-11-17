import React from "react";
import { CalendarType } from "./typing";
import { c } from "architecture";
import { t } from "architecture/lang";
import { TypeService } from "architecture/typing";

export function Calendar(info: CalendarType) {
  const { onConfirm, className = [], enableTime } = info;
  const [valueState, setValueState] = React.useState<string>("");
  const [inputValid, setInputValid] = React.useState<boolean>(true);
  return (
    <div className={c("group", inputValid ? "" : "invalid", ...className)}>
      <input
        value={valueState}
        type={enableTime ? "datetime-local" : "date"}
        name="calendar"
        max={enableTime ? "9999-12-31T23:59" : "9999-12-31"}
        onChange={(event) => {
          setValueState(event.target.value);
          setInputValid(true);
        }}
        placeholder="Empty"
      />
      <button
        onClick={() => {
          if (TypeService.isDate(valueState)) {
            onConfirm(valueState);
          } else {
            setInputValid(false);
          }
        }}
      >
        {t("component_confirm")}
      </button>
    </div>
  );
}
