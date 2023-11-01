import React, { CSSProperties, useEffect, useRef, useState } from "react";
import { OptionElementType, SelectType } from "./typing";
import { c } from "architecture";
import { Platform } from "obsidian";
import { LeafIcon } from "components/icons";
import { Icon } from "architecture/components/icon";
import { actionsStore } from "architecture/api";

export function Select(selectType: SelectType) {
  const { options, callback, className = [], autofocus = false } = selectType;
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
    if (!autofocus) return;
    if (Platform.isMobile && searchRef.current) {
      searchRef.current.style.display = "block";
      searchRef.current.focus();
    } else if (groupRef.current) {
      groupRef.current.focus();
    }
  }, [autofocus]);

  return (
    <div className={c("select-group", ...className)}>
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
      <div
        tabIndex={-1}
        ref={groupRef}
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
    </div>
  );
}

function OptionElement(optionElementType: OptionElementType) {
  const { option, index, isSelected, callback } = optionElementType;
  const { isLeaf, actionTypes, key, label } = option;
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
      title={key} // TODO: improve title to show next option info
      className={isSelected ? c("option", "selected") : c("option")}
      onClick={(mouseEvent) => {
        mouseEvent.stopPropagation();
        callback(key);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          callback(key);
        }
      }}
      autoFocus={isSelected}
      key={`option-${index}`}
      style={styleMemo}
    >
      {label}
      <div className={c("icon-group")}>
        {actionTypes.map((elementType, index) => (
          <ActionIcon
            type={elementType}
            isLeaf={isLeaf}
            key={`icon-${index}`}
          />
        ))}
      </div>
    </div>
  );
}

function ActionIcon(info: { type: string; isLeaf?: boolean }) {
  const { type, isLeaf } = info;
  return isLeaf ? (
    <LeafIcon />
  ) : (
    <Icon name={`${actionsStore.getIconOf(type)}`} />
  );
}
