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
    const orderedOptions = options
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([key]) => key);
    return orderedOptions;
  }, [options]);

  return (
    <div className={c("selectable-search")}>
      <SelectableSearch
        options={optionsMemo}
        initialSelections={selectedOptions}
        onChange={(tags) => {
          setSelectedOptions(tags);
        }}
        enableCreate={true}
        autoFocus
      />
      <button
        className={c("confirm-button")}
        onClick={() => {
          callback(selectedOptions);
        }}
      >
        {t("component_confirm")}
      </button>
    </div>
  );
}
