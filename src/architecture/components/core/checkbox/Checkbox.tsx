import React, { useState } from "react";
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
      <button
        title={confirmTooltip}
        onClick={() => {
          onConfirm(value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onConfirm(value);
          }
        }}
      >
        {confirmNode}
      </button>
    </div>
  );
}
