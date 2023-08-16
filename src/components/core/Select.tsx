import React, { MouseEventHandler } from "react";
import { OptionElementType, SelectType } from "./model/SelectModel";
import { c } from "architecture";

export function Select(selectType: SelectType) {
  const { options, callback } = selectType;
  const [selected, setSelected] = React.useState<string>("");

  const internalCallback: MouseEventHandler<HTMLDivElement> = async (event) => {
    // Obtain the selected option from the event target via value attribute
    event.preventDefault();
    const selectedOption = event.currentTarget.title;
    setSelected(selectedOption);
    callback(selectedOption);
  };

  return (
    <>
      {options.map((option, index) => (
        <OptionElement
          option={option}
          index={index}
          callback={internalCallback}
          isSelected={selected === option.key}
          key={`option-${option.key}-${index}`}
        />
      ))}
    </>
  );
}

function OptionElement(optionElementType: OptionElementType) {
  const { option, index, isSelected, callback } = optionElementType;

  return (
    <div
      title={option.key}
      className={isSelected ? c("option", "selected") : c("option")}
      onClick={callback}
      key={`option-${option.key}-${index}`}
    >
      {option.label}
    </div>
  );
}
