import React, { ChangeEvent, useRef, useState } from "react";
import { SelectableSearchType } from "./typing";
import { c } from "architecture/styles/helper";
import { Icon } from "architecture/components/icon";

export function SelectableSearch(props: SelectableSearchType) {
  const { options, initialSelections, onChange, placeholder } = props;
  const [filteredOptions, setFilteredOptions] = useState(options);
  /* Current selected options*/
  const [initialSelectionsState, setInitialSelectionsState] = useState(
    initialSelections || []
  );
  const [visibleOptions, setVisibleOptions] = useState<boolean>(false);

  /* Search list */
  const listRef = useRef<HTMLUListElement>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  /* Search input */
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchState, setSearchState] = useState("");
  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchState(value);
  };

  /* Actions */
  const handleClearAll = () => {
    setInitialSelectionsState([]);
    onChange([]);
  };

  return (
    <div className={c("selectable-search")}>
      <div
        className={c("selectable-pill-group")}
        onClick={() => {
          inputRef.current?.focus();
        }}
      >
        {initialSelectionsState.map((option, index) => (
          <div key={`${option}-${index}`} className={c("selectable-pill")}>
            <label onClick={() => {}}>{option}</label>
            <button
              onClick={(event) => {
                event.stopPropagation();
                // Remove from selected options
                const newSelectedOptions = initialSelectionsState.filter(
                  (selectedOption) => selectedOption !== option
                );
                setInitialSelectionsState(newSelectedOptions);
                setFilteredOptions([...filteredOptions, option]);
                onChange(newSelectedOptions);
              }}
            />
          </div>
        ))}
      </div>
      <input
        type="search"
        ref={inputRef}
        value={searchState}
        onChange={handleSearchChange}
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
              const valueFromCurrentIndex = filteredOptions[selectedIndex];
              const newSelectedOptions = [
                ...initialSelectionsState,
                valueFromCurrentIndex,
              ];

              setInitialSelectionsState(newSelectedOptions);
              setFilteredOptions(
                filteredOptions.filter(
                  (option) => option !== valueFromCurrentIndex
                )
              );
              setVisibleOptions(false);
              break;
            }
          }
        }}
        placeholder={placeholder}
        onFocus={() => {
          setVisibleOptions(true);
          setSelectedIndex(0);
        }}
      />
      <button onClick={handleClearAll}>
        <Icon name="cross" />
      </button>
      {visibleOptions && (
        <ul className={c("search-results")} ref={listRef}>
          {filteredOptions.map((option, index) => (
            <li
              key={`${option}-${index}`}
              className={
                index === selectedIndex
                  ? c("search-selected")
                  : c("search-hidden")
              }
              onClick={() => {
                const newSelectedOptions = [...initialSelectionsState, option];
                setInitialSelectionsState(newSelectedOptions);
                onChange(newSelectedOptions);
                setSearchState("");
              }}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
