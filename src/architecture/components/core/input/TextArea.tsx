import React, { useId } from "react";
import { c } from "architecture";
import { InputType } from "./typing";

/** A multi-line field in Obsidian's own look, with an optional label above it (#684). */
export function TextArea(info: InputType) {
  const {
    placeholder,
    label,
    className = [],
    value,
    required = false,
    autofocus = false,
    onChange,
    onKeyDown,
  } = info;
  const [valueState, setValueState] = React.useState<string>(value || "");
  const fieldId = useId();
  return (
    <div className={c("input-group", ...className)}>
      {label && (
        <label className={c("field-label")} htmlFor={fieldId}>
          {label}
        </label>
      )}
      <textarea
        id={fieldId}
        value={valueState}
        required={required}
        autoComplete="off"
        placeholder={placeholder}
        aria-label={label ? undefined : placeholder || undefined}
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
    </div>
  );
}
