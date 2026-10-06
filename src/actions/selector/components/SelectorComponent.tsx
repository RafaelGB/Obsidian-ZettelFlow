import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import React, { useMemo } from "react";
import { SelectorElement } from "zettelkasten";
import { OptionType, Select } from "application/components/select";

export function SelectorWrapper(props: WrappedActionBuilderProps) {
  const { callback, action } = props;
  const { options, defaultOption } = action as SelectorElement;
  const optionsMemo: OptionType[] = useMemo(() => {
    return options.map(([key, label]) => {
      // An option of a selector leads to no step, so it carries no step colour (#684): the default
      // used to be painted canvas green and every other option cyan, a meaning nobody had given
      // them. The default is marked in words instead, and the keyboard starts on it.
      const option: OptionType = {
        key,
        label,
        actionTypes: [],
        isDefault: defaultOption === key,
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
