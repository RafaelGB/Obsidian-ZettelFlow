import React, { ChangeEvent, useRef, useState } from "react";
import { SelectableSearchType } from "./typing";
import { c } from "architecture/styles/helper";
import { Icon } from "architecture/components/icon";
import { useOnClickAway } from "architecture/hooks";

export function SelectableSearch(props: SelectableSearchType) {
  const { options, initialSelections, onChange, placeholder, enableCreate } =
    props;
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
    setFilteredOptions(options);
    setSearchState("");
    onChange([]);
  };
  const ref = useRef<HTMLDivElement>(null);
  useOnClickAway(ref, () => {
    setVisibleOptions(false);
    setSelectedIndex(0);
  });

  return (
    <div className={c("selectable-search")} ref={ref}>
      <div className={c("selectable-search-header")}>
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
                  // filter the neSelectedOptions from the original options
                  setFilteredOptions(
                    options.filter((op) => !newSelectedOptions.contains(op))
                  );
                  onChange(newSelectedOptions);
                }}
              >
                <Icon name="cross" />
              </button>
            </div>
          ))}
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
                    Math.min(
                      Object.keys(filteredOptions).length - 1,
                      prevIndex + 1
                    )
                  );
                  break;
                }
                case "Enter": {
                  e.preventDefault();
                  if (enableCreate) {
                    const newSelectedOptions = [
                      ...initialSelectionsState,
                      searchState,
                    ];
                    setInitialSelectionsState(newSelectedOptions);
                    setFilteredOptions(
                      options.filter((op) => !newSelectedOptions.contains(op))
                    );
                    setSearchState("");
                    onChange(newSelectedOptions);
                  } else {
                    const valueFromCurrentIndex =
                      filteredOptions[selectedIndex];
                    const newSelectedOptions = [
                      ...initialSelectionsState,
                      valueFromCurrentIndex,
                    ];
                    setInitialSelectionsState(newSelectedOptions);
                    setFilteredOptions(
                      options.filter((op) => !newSelectedOptions.contains(op))
                    );
                    onChange(newSelectedOptions);
                  }

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
        </div>
        <button onClick={handleClearAll}>
          <Icon name="cross" />
        </button>
      </div>
      {visibleOptions && (
        <ul
          className={c("search-results", "selectable-search-results")}
          ref={listRef}
        >
          {filteredOptions.map((option, index) => (
            <li
              key={`${option}-${index}`}
              className={
                index === selectedIndex
                  ? c("search-selected")
                  : c("search-hidden")
              }
              onClick={() => {
                setFilteredOptions(
                  filteredOptions.filter((op) => op !== option)
                );

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
