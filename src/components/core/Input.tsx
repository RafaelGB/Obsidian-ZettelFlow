import React from "react";
import { c } from "architecture";
import { InputType } from "./model/InputModel";

export function Input(info: InputType) {
  const {
    placeholder,
    className = [],
    value,
    required = false,
    onChange,
    onKeyDown,
  } = info;
  const [valueState, setValueState] = React.useState<string | undefined>(
    value || ""
  );
  return (
    <div className={c("input-group", ...className)}>
      <input
        value={valueState}
        type="text"
        name="title"
        required={required}
        autoComplete="off"
        onChange={(event) => {
          const value = event.target.value;
          setValueState(value);
          if (onChange) {
            onChange(value);
          }
        }}
        onKeyDown={(event) => {
          if (onKeyDown) {
            onKeyDown(event.key, valueState || "");
          }
        }}
      />
      <label className={c("input-label")}>{placeholder}</label>
    </div>
  );
}
