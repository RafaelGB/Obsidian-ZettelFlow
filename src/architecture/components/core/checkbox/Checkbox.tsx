import React, { useState } from "react";
import { ConfirmStep } from "../confirmStep/ConfirmStep";
import { CheckboxType } from "./typing";
import { c } from "architecture";
import { t } from "architecture/lang";

export function Checkbox(props: CheckboxType) {
  const {
    onConfirm,
    confirmTooltip,
    className = [],
    confirmNode = t("component_confirm"),
  } = props;

  const [value, setValue] = useState(false);
  return (
    <div className={c("group", ...className)}>
      <input
        type="checkbox"
        checked={value}
        onChange={() => setValue(!value)}
      />
      <ConfirmStep
        onConfirm={() => onConfirm(value)}
        tooltip={confirmTooltip}
        label={typeof confirmNode === "string" ? confirmNode : undefined}
      />
    </div>
  );
}
