import { c } from "architecture";
import React, { useState } from "react";
import { useRef } from "react";
import { SearchType } from "./typing";
import {
  useOnClickAway,
  useScrollToSelected,
  useVisibleModalOverflow,
} from "architecture/hooks";

export function Search<T>(props: SearchType<T>) {
  const { onChange, options, placeholder } = props;
  // Refs
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // States
  const [value, setValue] = useState<string>("");
  const [selectedValue, setSelectedValue] = useState<string>("");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [filteredOptions, setFilteredOptions] =
    useState<Record<string, T>>(options);
  const [visibleOptions, setVisibleOptions] = useState<boolean>(false);

  // Hooks
  useOnClickAway(ref, () => {
    setVisibleOptions(false);
    setValue(selectedValue);
    setSelectedIndex(0);
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
            onChange(null);
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
          setSelectedIndex(0);
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
              const [key, value] = getEntryByIndex(
                filteredOptions,
                selectedIndex
              );
              setValue(key);
              setSelectedValue(key);
              setFilteredOptions(filterRecordByKey(options, key));
              onChange(value);
              ref.current?.querySelector("input")?.blur();
              setVisibleOptions(false);
              break;
            }
          }
        }}
        placeholder={placeholder}
      />
      {visibleOptions && (
        <ul className={c("search-results")} ref={listRef}>
          {Object.entries(filteredOptions).map(([key, value], index) => (
            <li
              tabIndex={index}
              onClick={() => {
                setValue(key);
                setSelectedValue(key);
                setFilteredOptions(filterRecordByKey(options, key));
                onChange(value);
                // blur of input
                ref.current?.querySelector("input")?.blur();
                setVisibleOptions(false);
              }}
              key={`option-${index}-${key}`}
              className={
                index === selectedIndex
                  ? c("search-selected")
                  : c("search-hidden")
              }
            >
              {key}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
function getEntryByIndex<T>(
  record: Record<string, T>,
  index: number
): [string, T] {
  return Object.entries(record)[index];
}

function filterRecordByKey<T>(record: Record<string, T>, filterer: string) {
  const filteredRecord = Object.entries(record)
    // Filter by value the record
    .filter(([key, _]) => key.toLowerCase().includes(filterer.toLowerCase()))
    // Map again to a record
    .reduce((acc: Record<string, T>, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  return filteredRecord;
}
