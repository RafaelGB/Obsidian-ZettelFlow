import { c } from "architecture";
import React, { useState } from "react";
import { useRef } from "react";
import { SearchType } from "./model/SearchModel";
import {
  useOnClickAway,
  useScrollToSelected,
  useVisibleModalOverflow,
} from "architecture/hooks";

export function Search(props: SearchType) {
  const { onChange, options, placeholder } = props;
  // Refs
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // States
  const [value, setValue] = useState<string>("");
  const [selectedValue, setSelectedValue] = useState<string>("");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [filteredOptions, setFilteredOptions] =
    useState<Record<string, string>>(options);
  const [visibleOptions, setVisibleOptions] = useState<boolean>(false);

  // Hooks
  useOnClickAway(ref, () => {
    setVisibleOptions(false);
  });
  useVisibleModalOverflow([selectedValue]);
  useScrollToSelected(listRef, selectedIndex);

  // Render
  return (
    <div ref={ref}>
      <input
        type="search"
        value={value}
        onChange={(e) => {
          const value = e.target.value;
          if (!value) {
            setSelectedValue("");
            setFilteredOptions(options);
            onChange("");
          }
          if (!visibleOptions) {
            setVisibleOptions(true);
            setSelectedIndex(0);
          }
          setValue(value);
          setFilteredOptions(filterRecordByKey(options, value));
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
                Math.min(Object.keys(filteredOptions).length - 1, prevIndex + 1)
              );
              break;
            }
            case "Enter": {
              e.preventDefault();
              const value = filteredOptions[selectedIndex];
              setValue(value);
              setSelectedValue(value);
              setFilteredOptions(filterRecordByKey(options, value));
              onChange(value);
              break;
            }
          }
        }}
        placeholder={placeholder}
      />
      {visibleOptions && (
        <ul className={c("search-results")} ref={listRef}>
          {Object.entries(filteredOptions).map(([key, f], index) => (
            <li
              tabIndex={index}
              onClick={() => {
                setValue(f);
                setSelectedValue(f);
                setFilteredOptions(filterRecordByKey(options, f));
                onChange(key);
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

function filterRecordByKey(record: Record<string, string>, filterer: string) {
  const filteredRecord = Object.entries(record)
    // Filter by value the record
    .filter(([_, value]) =>
      value.toLowerCase().includes(filterer.toLowerCase())
    )
    // Map again to a record
    .reduce((acc: Record<string, string>, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  return filteredRecord;
}
