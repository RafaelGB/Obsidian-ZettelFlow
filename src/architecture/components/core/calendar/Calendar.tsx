import React, { useId } from "react";
import { CalendarType } from "./typing";
import { c } from "architecture";
import { t } from "architecture/lang";
import { ConfirmStep, confirmsOn } from "../confirmStep/ConfirmStep";
import { TypeService } from "architecture/typing";

/**
 * A date, typed or picked (#684). Focusing the field used to open the system picker by force, so
 * the keyboard could never just type a date and the picker covered the step it belonged to. The
 * field is Obsidian's own date input now: type into it, or open its picker when you want one.
 */
export function Calendar(info: CalendarType) {
  const { onConfirm, className = [], enableTime, autofocus = false } = info;
  const [valueState, setValueState] = React.useState<string>("");
  const [inputValid, setInputValid] = React.useState<boolean>(true);
  const fieldId = useId();

  const valid = (): boolean => {
    const ok = TypeService.isDate(valueState);
    setInputValid(ok);
    return ok;
  };

  return (
    <div className={`${c("field", ...className)}${inputValid ? "" : " is-invalid"}`}>
      <label className={c("field-label")} htmlFor={fieldId}>
        {enableTime ? t("calendar_field_label_time") : t("calendar_field_label")}
      </label>
      <input
        id={fieldId}
        className={c("field-control", "field-control-date")}
        value={valueState}
        type={enableTime ? "datetime-local" : "date"}
        name="calendar"
        max={enableTime ? "9999-12-31T23:59" : "9999-12-31"}
        aria-invalid={!inputValid}
        onChange={(event) => {
          setValueState(event.target.value);
          setInputValid(true);
        }}
        onKeyDown={(event) => {
          if (!confirmsOn(event)) return;
          event.preventDefault();
          if (valid()) onConfirm(valueState);
        }}
        autoFocus={autofocus}
      />
      <ConfirmStep onConfirm={() => onConfirm(valueState)} canConfirm={valid} />
    </div>
  );
}
