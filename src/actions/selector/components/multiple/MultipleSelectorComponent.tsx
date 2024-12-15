import { c } from "architecture";
import { SelectableSearch } from "architecture/components/core";
import { t } from "architecture/lang";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import React, { useMemo, useState } from "react";
import { SelectorElement } from "zettelkasten";

export function MultipleSelector(props: WrappedActionBuilderProps) {
  const { callback, action } = props;
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const { options } = action as SelectorElement;
  const optionsMemo = useMemo(() => {
    // Sort record by entry value (number type)
    const orderedOptions = options
      .sort((a, b) => {
        // Alphabetical order
        return a[1] > b[1] ? 1 : -1;
      })
      .map(([key]) => key);
    return orderedOptions;
  }, []);

  return (
    <div className={c("tags")}>
      <SelectableSearch
        options={optionsMemo}
        onChange={(tags) => {
          setSelectedOptions(tags);
        }}
        enableCreate={true}
        autoFocus
      />
      <button
        onClick={() => {
          callback(selectedOptions);
        }}
      >
        {t("component_confirm")}
      </button>
    </div>
  );
}
