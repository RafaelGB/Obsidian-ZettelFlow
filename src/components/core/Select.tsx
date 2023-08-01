import React from "react";
import { OptionElementType, SelectType } from "./model/SelectModel";

export function Select(selectType: SelectType) {
  const { options } = selectType;
  
  return (
    <>
    {options.map((option,index) => (
      <OptionElement key={option.key} label={option.label} index={index} />
    ))}
    </>
  );
}

function OptionElement(optionElementType: OptionElementType) {
  const { key,label, index } = optionElementType;
  return (
    <option value={key}>{label}</option>
  );
}
