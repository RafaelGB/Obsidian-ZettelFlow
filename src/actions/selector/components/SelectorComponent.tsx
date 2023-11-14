import { Dropdown } from "architecture/components/core";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import React from "react";
import { SelectorElement } from "zettelkasten";

export function SelectorWrapper(props: WrappedActionBuilderProps) {
  const { callback, action } = props;
  const { options, defaultOption } = action as SelectorElement;
  return (
    <Dropdown
      options={options}
      defaultValue={defaultOption || Object.keys(options)[0]}
      onConfirm={(value) => {
        callback(value);
      }}
    />
  );
}
