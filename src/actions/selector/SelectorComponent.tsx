import { WrappedActionBuilderProps } from "components/NoteBuilder";
import { Dropdown } from "components/core";
import React from "react";
import { SelectorElement } from "zettelkasten";

export function SelectorWrapper(props: WrappedActionBuilderProps) {
  const { callback, action } = props;
  const { options, defaultOption } = action.element as SelectorElement;
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
