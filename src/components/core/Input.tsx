import React from "react";
import { c } from "architecture";
import { InputType } from "./model/InputModel";

export function Input(info: InputType) {
  const { placeholder, value, onChange, onKeyDown } = info;
  const [valueState, setValueState] = React.useState<string>(value || "");
  return (
    <>
      <input
        value={valueState}
        type="text"
        name="title"
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
            onKeyDown(event.key, valueState);
          }
        }}
        required={true}
      />
      <label className={c("input-label")}>{placeholder}</label>
    </>
  );
}
