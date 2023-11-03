import React, { ChangeEvent, useState } from "react";
import { SelectableSearchType } from "./typing";
import { c } from "architecture/styles/helper";

export function SelectableSearch(props: SelectableSearchType) {
  const { options, initialSelections, onChange } = props;

  const [optionsState, setOptionsState] = useState(options);
  const [initialSelectionsState, setInitialSelectionsState] = useState(
    initialSelections || []
  );
  const [visibleOptions, setVisibleOptions] = useState<boolean>(false);
  /* Search */
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
      <div className={c("selectable-pill-group")}>
        {initialSelectionsState.map((option, index) => (
          <div key={`${option}-${index}`} className={c("selectable-pill")}>
            <label onClick={() => {}}>{option}</label>
          </div>
        ))}
      </div>
      <input
        type="text"
        value={searchState}
        onChange={handleSearchChange}
        onFocus={() => setVisibleOptions(true)}
        onBlur={() => setVisibleOptions(false)}
        placeholder="Buscar..."
      />
      <button onClick={handleClearAll}>Borrar Todo</button>
      {visibleOptions && (
        <div className={c("selectable-search-options")}>
          {optionsState
            .filter(
              (option) =>
                !searchState.toLowerCase().includes(option.toLowerCase())
            )
            .map((option, index) => (
              <div key={`${option}-${index}`} className={c("search-pill")}>
                <label onClick={() => {}}>{option}</label>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
