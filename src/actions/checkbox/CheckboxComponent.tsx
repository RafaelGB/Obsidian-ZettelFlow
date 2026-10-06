import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import { Checkbox } from "architecture/components/core";
import { t } from "architecture/lang";
import React from "react";
import { CheckboxElement } from "zettelkasten";
import { checkboxText } from "./checkboxText";

export function CheckboxWrapper(props: WrappedActionBuilderProps) {
  const { action, callback } = props;
  const { confirmTooltip, key } = action as CheckboxElement;
  return (
    <Checkbox
      onConfirm={(value) => {
        callback(value);
      }}
      confirmTooltip={confirmTooltip}
      label={checkboxText(action as CheckboxElement) ?? t("checkbox_default_label")}
      hint={typeof key === "string" && key ? t("checkbox_writes_property", key) : undefined}
    />
  );
}
