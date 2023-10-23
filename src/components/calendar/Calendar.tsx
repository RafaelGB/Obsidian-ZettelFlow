import React from "react";
import { CalendarType } from "./typing";
import { c } from "architecture";
import { t } from "architecture/lang";
import { TypeService } from "architecture/typing";

export function Calendar(info: CalendarType) {
  const { onConfirm, className = [] } = info;
  const [valueState, setValueState] = React.useState<string>("");
  const [inputValid, setInputValid] = React.useState<boolean>(true);
  return (
    <div className={c("group", inputValid ? "" : "invalid", ...className)}>
      <input
        value={valueState}
        type="date"
        name="calendar"
        max={"9999-12-31"}
        onChange={(event) => {
          setValueState(event.target.value);
          setInputValid(true);
        }}
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
