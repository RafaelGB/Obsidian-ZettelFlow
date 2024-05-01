import React from "react";
import { c } from "architecture";
import { InputType } from "./typing";

export function Input(info: InputType) {
  const {
    placeholder,
    className = [],
    value,
    required = false,
    onChange,
    onKeyDown,
    disablePlaceHolderLabel = false,
    autofocus = false,
  } = info;
  const [valueState, setValueState] = React.useState<string>(value || "");
  return (
    <div className={c("input-group", ...className)}>
      <input
        value={valueState}
        type="text"
        required={required}
        autoComplete="off"
        inputMode="text"
        onChange={(event) => {
          const value = event.target.value;
          setValueState(value);
          if (onChange) {
            onChange(value);
          }
        }}
        onKeyDown={(event) => {
          if (onKeyDown) {
            onKeyDown(event, valueState || "");
          }
        }}
        autoFocus={autofocus}
      />
      {!disablePlaceHolderLabel && (
        <label className={c("input-label")}>{placeholder}</label>
      )}
    </div>
  );
}
