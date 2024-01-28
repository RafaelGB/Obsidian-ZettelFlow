import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import React, { useMemo } from "react";
import { SelectorElement } from "zettelkasten";
import { OptionType, Select } from "application/components/select";

export function SelectorWrapper(props: WrappedActionBuilderProps) {
  const { callback, action } = props;
  const { options, defaultOption } = action as SelectorElement;
  const optionsMemo: OptionType[] = useMemo(() => {
    return options.map(([key, label]) => {
      const option: OptionType = {
        key,
        label,
        color:
          defaultOption === key
            ? "var(--canvas-color-4)"
            : "var(--canvas-color-5)",
        actionTypes: [],
      };
      return option;
    });
  }, []);

  return (
    <Select
      key={`selector-root-${options.length}`}
      options={optionsMemo}
      callback={(selected) => callback(selected)}
      autofocus={true}
    />
  );
}
