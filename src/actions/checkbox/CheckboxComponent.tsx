import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import { Checkbox } from "architecture/components/core";
import React from "react";
import { CheckboxElement } from "zettelkasten";

export function CheckboxWrapper(props: WrappedActionBuilderProps) {
  const { action, callback } = props;
  const { confirmTooltip } = action as CheckboxElement;
  return (
    <Checkbox
      onConfirm={(value) => {
        callback(value);
      }}
      confirmTooltip={confirmTooltip}
    />
  );
}
