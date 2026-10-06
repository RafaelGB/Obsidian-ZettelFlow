import React, { useId } from "react";
import { c } from "architecture";
import { InputType } from "./typing";

/**
 * A single-line field in Obsidian's own look (#684). It used to float a Material label over the
 * box and light it with a hard-coded blue glow on focus and whenever it held text; the theme's
 * focus ring is the only one now. A `label` is drawn above the field, the placeholder stays a
 * placeholder.
 */
export function Input(info: InputType) {
  const {
    placeholder,
    label,
    className = [],
    value,
    required = false,
    onChange,
    onKeyDown,
    disablePlaceHolderLabel = false,
    autofocus = false,
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
      <input
        id={fieldId}
        value={valueState}
        type="text"
        required={required}
        autoComplete="off"
        inputMode="text"
        placeholder={disablePlaceHolderLabel ? undefined : placeholder}
        aria-label={label ? undefined : placeholder}
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
