import React from "react";
import { InputType } from "./model/InputModel";
import { c } from "architecture";

export function Input(inputType: InputType) {
  const { value, placeholder, type, onChange } = inputType;
  return (
    <>
      <input
        value={value}
        type={type}
        name="text"
        autoComplete="off"
        onChange={onChange}
        required={true}
      />
      <label className={c("input-label")}>{placeholder}</label>
    </>
  );
}
