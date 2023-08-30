import React, {
  CSSProperties,
  MouseEventHandler,
  useEffect,
  useRef,
  useState,
} from "react";
import { OptionElementType, SelectType } from "./model/SelectModel";
import { c } from "architecture";

export function Select(selectType: SelectType) {
  const { options, callback, className = [] } = selectType;
  const [selected, setSelected] = useState<string>("");
  const [searchValue, setSearchValue] = useState<string>("");
  const [optionsState, setOptionsState] = useState(options);
  const internalCallback: MouseEventHandler<HTMLDivElement> = async (event) => {
    // Obtain the selected option from the event target via value attribute
    event.preventDefault();
    const selectedOption = event.currentTarget.title;
    setSelected(selectedOption);
    callback(selectedOption);
  };

  const groupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    groupRef.current?.focus();
  }, []);

  return (
    <div
      tabIndex={-1}
      ref={groupRef}
      className={c("select-group", ...className)}
      onKeyDown={(event) => {
        // Control arrow up and down
        if (event.key === "ArrowDown") {
        } else if (event.key === "ArrowUp") {
        } else if (
          searchRef.current &&
          searchRef.current.style.display !== "block"
        ) {
          searchRef.current.style.display = "block";
          searchRef.current.focus();
        }
      }}
    >
      <input
        type="text"
        ref={searchRef}
        value={searchValue}
        placeholder="Search"
        onChange={(event) => {
          const value = event.target.value;
          setOptionsState(
            options.filter((option) =>
              option.label.toLowerCase().includes(value.toLowerCase())
            )
          );
          setSearchValue(value);
        }}
        onBlur={() => groupRef.current?.focus()}
      />
      {optionsState.map((option, index) => (
        <OptionElement
          option={option}
          index={index}
          callback={internalCallback}
          isSelected={selected === option.key}
          key={`option-${option.key}-${index}`}
        />
      ))}
    </div>
  );
}

function OptionElement(optionElementType: OptionElementType) {
  const { option, index, isSelected, callback } = optionElementType;
  const styleMemo = React.useMemo<CSSProperties>(() => {
    return {
      "--canvas-color": option.color,
    } as CSSProperties;
  }, []);
  return (
    <div
      title={option.key}
      className={isSelected ? c("option", "selected") : c("option")}
      onClick={callback}
      key={`option-${option.key}-${index}`}
      style={styleMemo}
    >
      {option.label}
    </div>
  );
}
