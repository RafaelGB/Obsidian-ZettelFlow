import React from "react";
import { OptionElementType, SelectType } from "./model/SelectModel";
import { c } from "architecture";

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
  const [selected, setSelected] = React.useState(false);

  const callback = () => {
    setSelected(!selected);
  };
  
  return (
    <option 
      value={key} 
      className={selected?c("option","selected"):c("option")} 
      selected={selected} 
      onClick={callback}
    >
      {label}
    </option>
  );
}
