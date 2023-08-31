import React, { CSSProperties, useEffect, useRef, useState } from "react";
import { OptionElementType, SelectType } from "./model/SelectModel";
import { c } from "architecture";

export function Select(selectType: SelectType) {
  const { options, callback, className = [] } = selectType;
  const [selected, setSelected] = useState<string>("");
  const [arrowIndex, setArrowIndex] = useState<number>(-1);
  const [searchValue, setSearchValue] = useState<string>("");
  const [optionsState, setOptionsState] = useState(options);
  const internalCallback = async (selectedOption: string) => {
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
      onClick={() => {
        groupRef.current?.focus();
      }}
      onKeyDown={(event) => {
        // Ignore special keys like tab, shift, etc. except arrow up and down
        if (
          event.key.length > 1 &&
          event.key !== "ArrowDown" &&
          event.key !== "ArrowUp"
        ) {
          return;
        }
        // Control arrow up and down
        if (event.key === "ArrowDown") {
          if (arrowIndex < optionsState.length - 1) {
            setSelected(optionsState[arrowIndex + 1].key);
            setArrowIndex(arrowIndex + 1);
          }
        } else if (event.key === "ArrowUp") {
          if (arrowIndex > 0) {
            setSelected(optionsState[arrowIndex - 1].key);
            setArrowIndex(arrowIndex - 1);
          }
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
  const optionRef = useRef<HTMLDivElement>(null);
  const styleMemo = React.useMemo<CSSProperties>(() => {
    return {
      "--canvas-color": option.color,
    } as CSSProperties;
  }, []);

  useEffect(() => {
    if (isSelected) {
      optionRef.current?.focus();
    }
  }, [isSelected]);

  return (
    <div
      ref={optionRef}
      tabIndex={index}
      title={option.key} // TODO: improve title to show next option info
      className={isSelected ? c("option", "selected") : c("option")}
      onClick={(mouseEvent) => {
        mouseEvent.stopPropagation();
        callback(option.key);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          callback(option.key);
        }
      }}
      autoFocus={isSelected}
      key={`option-${index}`}
      style={styleMemo}
    >
      {option.label}
    </div>
  );
}
