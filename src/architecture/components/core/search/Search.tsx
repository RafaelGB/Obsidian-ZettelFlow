import { c } from "architecture";
import React, { useEffect, useLayoutEffect, useState } from "react";
import { useRef } from "react";
import { SearchType } from "./typing";
import { useOnClickAway, useScrollToSelected } from "architecture/hooks";
import ReactDOM from "react-dom";

export function Search<T>(props: SearchType<T>) {
  const { className, onChange, options, placeholder } = props;
  // Refs
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Initial mockup of HTMLUListElement
  const listRef = useRef<HTMLUListElement>(activeDocument.createElement("ul"));
  // States
  const [value, setValue] = useState<string>("");
  const [selectedValue, setSelectedValue] = useState<string>("");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [filteredOptions, setFilteredOptions] =
    useState<Record<string, T>>(options);
  const [visibleOptions, setVisibleOptions] = useState<boolean>(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const [optionsHeight, setOptionsHeight] = useState(0);

  // Hooks
  useOnClickAway(listRef, () => {
    setVisibleOptions(false);
    setValue(selectedValue);
    setSelectedIndex(0);
  });
  useScrollToSelected(listRef, selectedIndex);

  const updatePosition = () => {
    if (!visibleOptions || !inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    const h = listRef.current?.offsetHeight ?? optionsHeight;
    const spaceDown = window.innerHeight - r.bottom;
    const spaceUp = r.top;

    const renderDown = spaceDown >= h || spaceDown > spaceUp;
    const top = renderDown ? r.bottom : Math.max(8, r.top - h); // clamp pequeño

    setPosition({ top, left: r.left, width: r.width });
  };

  useLayoutEffect(() => {
    if (visibleOptions && listRef.current) {
      setOptionsHeight(listRef.current.offsetHeight);
      updatePosition();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleOptions]);

  useEffect(() => {
    if (!visibleOptions) return;
    updatePosition();
    // captura scrolls de cualquier contenedor
    const opts = { capture: true, passive: true } as AddEventListenerOptions;
    activeWindow.addEventListener("scroll", updatePosition, opts);
    activeWindow.addEventListener("resize", updatePosition);
    return () => {
      activeWindow.removeEventListener("scroll", updatePosition, opts as any);
      activeWindow.removeEventListener("resize", updatePosition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleOptions]);

  const searchOptionsFn = (
    <ul
      ref={listRef}
      className={c("search-results")}
      style={{
        top: position.top,
        left: position.left,
        width: position.width,
      }}
    >
      {Object.entries(filteredOptions).map(([key, value], index) => (
        <li
          key={`option-${index}-${key}`}
          tabIndex={index}
          onClick={() => {
            setValue(key);
            setSelectedValue(key);
            setFilteredOptions(filterRecordByKey(options, key));
            onChange(value);
            ref.current?.querySelector("input")?.blur();
            setVisibleOptions(false);
          }}
          className={index === selectedIndex ? c("search-selected") : ""}
        >
          {key}
        </li>
      ))}
    </ul>
  );

  // Render
  return (
    <div ref={ref}>
      <input
        ref={inputRef}
        type="search"
        className={className}
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
              e.stopPropagation();
              setSelectedIndex((prevIndex) => Math.max(0, prevIndex - 1));
              break;
            }
            case "ArrowDown": {
              e.preventDefault();
              e.stopPropagation();
              setSelectedIndex((prevIndex) =>
                Math.min(Object.keys(filteredOptions).length - 1, prevIndex + 1)
              );
              break;
            }
            case "Enter": {
              e.preventDefault();
              e.stopPropagation();
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
            case "Escape": {
              e.stopPropagation();
              e.preventDefault();
              setVisibleOptions(false);
              setValue(selectedValue);
              setSelectedIndex(0);
              break;
            }
          }
        }}
        placeholder={placeholder}
      />
      {ReactDOM.createPortal(
        visibleOptions ? searchOptionsFn : null,
        activeDocument.body
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
    .filter(([key]) => key.toLowerCase().includes(filterer.toLowerCase()))
    // Map again to a record
    .reduce((acc: Record<string, T>, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  return filteredRecord;
}
