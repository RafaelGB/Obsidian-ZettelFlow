import { c } from "architecture";
import React, { useState } from "react";
import { useRef } from "react";
import { SearchType } from "./model/SearchModel";
import { useOnClickAway, useVisibleModalOverflow } from "architecture/hooks";

export function Search(props: SearchType) {
  const { onChange, options, placeholder } = props;
  // Refs
  const ref = useRef<HTMLDivElement>(null);

  // States
  const [value, setValue] = useState<string>("");
  const [selectedValue, setSelectedValue] = useState<string>("");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [filteredOptions, setFilteredOptions] = useState<string[]>(options);
  const [visibleOptions, setVisibleOptions] = useState<boolean>(false);

  // Hooks
  useOnClickAway(ref, () => {
    setVisibleOptions(false);
  });
  useVisibleModalOverflow();

  // Render
  return (
    <div ref={ref}>
      <input
        type="search"
        value={value}
        onChange={(e) => {
          const value = e.target.value;
          setValue(value);
          if (!value) {
            setSelectedValue("");
            setFilteredOptions(options);
            onChange("");
          } else {
            setFilteredOptions(
              options.filter((f) =>
                f.toLowerCase().includes(e.target.value.toLowerCase())
              )
            );
          }
        }}
        onFocus={() => {
          setVisibleOptions(true);
          setValue(selectedValue);
        }}
        onKeyDown={(e) => {
          switch (e.key) {
            case "ArrowUp": {
              e.preventDefault();
              setSelectedIndex((prevIndex) => Math.max(0, prevIndex - 1));
              break;
            }
            case "ArrowDown": {
              e.preventDefault();
              setSelectedIndex((prevIndex) =>
                Math.min(filteredOptions.length - 1, prevIndex + 1)
              );
              break;
            }
            case "Enter": {
              const value = filteredOptions[selectedIndex];
              setValue(value);
              setSelectedValue(value);
              setVisibleOptions(false);
              onChange(value);
              break;
            }
          }
        }}
        placeholder={placeholder}
      />
      {visibleOptions && (
        <ul className={c("search-results")}>
          {filteredOptions.map((f, index) => (
            <li
              tabIndex={index}
              onClick={() => {
                setValue(f);
                setSelectedValue(f);
                setFilteredOptions(
                  options.filter((internalF) =>
                    internalF.toLowerCase().includes(f.toLowerCase())
                  )
                );
                onChange(f);
              }}
              key={`file-${f}`}
              className={
                index === selectedIndex
                  ? c("search-selected")
                  : c("search-hidden")
              }
            >
              {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
