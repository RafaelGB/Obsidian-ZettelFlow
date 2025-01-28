import React, {
  ChangeEvent,
  useRef,
  useState,
  useMemo,
  useEffect,
} from "react";
import { SelectableSearchType } from "./typing";
import { c } from "architecture/styles/helper";
import { Icon } from "architecture/components/icon";
import { useOnClickAway } from "architecture/hooks";

export function SelectableSearch(props: SelectableSearchType) {
  const {
    options,
    initialSelections = [],
    onChange,
    placeholder = "Buscar...",
    enableCreate = false,
    autoFocus = false,
    disabled = false,
  } = props;

  const [searchState, setSearchState] = useState("");
  const [visibleOptions, setVisibleOptions] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(
    activeDocument.createElement("div")
  );

  const filteredOptions = useMemo(() => {
    const lowerSearch = searchState.toLowerCase();
    return options.filter(
      (option) =>
        option.toLowerCase().includes(lowerSearch) &&
        !initialSelections.includes(option)
    );
  }, [options, searchState, initialSelections]);

  const [selectedOptions, setSelectedOptions] =
    useState<string[]>(initialSelections);

  useEffect(() => {
    setSelectedOptions(initialSelections);
  }, [initialSelections]);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchState(event.target.value);
    setSelectedIndex(0);
  };

  const handleClearAll = () => {
    setSelectedOptions([]);
    setSearchState("");
    onChange([]);
  };

  const handleOptionSelect = (option: string) => {
    const newSelectedOptions = [...selectedOptions, option];
    setSelectedOptions(newSelectedOptions);
    onChange(newSelectedOptions);
    setSearchState("");
    setVisibleOptions(false);
  };

  const handleRemoveOption = (option: string) => {
    const newSelectedOptions = selectedOptions.filter(
      (selectedOption) => selectedOption !== option
    );
    setSelectedOptions(newSelectedOptions);
    onChange(newSelectedOptions);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prevIndex) =>
          prevIndex > 0 ? prevIndex - 1 : filteredOptions.length - 1
        );
        break;
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prevIndex) =>
          prevIndex < filteredOptions.length - 1 ? prevIndex + 1 : 0
        );
        break;
      case "Enter":
        e.preventDefault();
        if (filteredOptions[selectedIndex]) {
          handleOptionSelect(filteredOptions[selectedIndex]);
        } else if (enableCreate && searchState.trim()) {
          handleOptionSelect(searchState.trim());
        }
        break;
      case "Escape":
        setVisibleOptions(false);
        break;
      default:
        break;
    }
  };

  useOnClickAway(containerRef, () => {
    setVisibleOptions(false);
    setSelectedIndex(0);
  });

  return (
    <div className={c("selectable-search")} ref={containerRef}>
      <div className={c("selectable-search-header")}>
        <div
          className={c("selectable-pill-group")}
          onClick={() => {
            inputRef.current?.focus();
            setVisibleOptions(true);
          }}
          role="combobox"
          aria-haspopup="listbox"
          aria-owns="search-results"
          aria-expanded={visibleOptions}
        >
          {selectedOptions.map((option, index) => (
            <div key={`${option}-${index}`} className={c("selectable-pill")}>
              <span className={c("pill-label")}>{option}</span>
              <button
                disabled={disabled}
                className={c("pill-remove-button")}
                aria-label={`Eliminar ${option}`}
                onClick={(event) => {
                  event.stopPropagation();
                  handleRemoveOption(option);
                }}
              >
                <Icon name="cross" />
              </button>
            </div>
          ))}
          <input
            disabled={disabled}
            type="search"
            ref={inputRef}
            value={searchState}
            onChange={handleSearchChange}
            autoFocus={autoFocus}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            onFocus={() => setVisibleOptions(true)}
            aria-autocomplete="list"
            aria-controls="search-results"
          />
        </div>
        {selectedOptions.length > 0 && (
          <button
            disabled={disabled}
            className={c("clear-all-button")}
            onClick={handleClearAll}
            aria-label="Eliminar todas las selecciones"
          >
            <Icon name="cross" />
          </button>
        )}
      </div>
      {visibleOptions && (
        <ul
          className={c("search-results", "selectable-search-results")}
          ref={listRef}
          role="listbox"
          id="search-results"
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, index) => (
              <li
                key={`${option}-${index}`}
                className={
                  index === selectedIndex
                    ? c("search-selected")
                    : c("search-option")
                }
                onClick={() => handleOptionSelect(option)}
                role="option"
                aria-selected={index === selectedIndex}
              >
                {option}
              </li>
            ))
          ) : enableCreate && searchState.trim() ? (
            <li
              className={c("search-option")}
              onClick={() => handleOptionSelect(searchState.trim())}
              role="option"
            >
              Crear y seleccionar "{searchState.trim()}"
            </li>
          ) : (
            <li className={c("no-results")}>No se encontraron resultados</li>
          )}
        </ul>
      )}
    </div>
  );
}
