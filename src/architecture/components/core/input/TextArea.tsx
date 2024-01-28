import React from "react";
import { c } from "architecture";
import { InputType } from "./typing";

export function TextArea(info: InputType) {
  const {
    placeholder,
    className = [],
    value,
    required = false,
    autofocus = false,
    onChange,
    onKeyDown,
  } = info;
  const [valueState, setValueState] = React.useState<string>(value || "");
  return (
    <div className={c("input-group", ...className)}>
      <textarea
        value={valueState}
        required={required}
        autoComplete="off"
        placeholder={placeholder}
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
            onKeyDown(event.key, valueState || "");
          }
        }}
        autoFocus={autofocus}
      />
    </div>
  );
}
