import React, { useState } from "react";
import { DropdownType } from "./typing";
import { c } from "architecture";
import { TypeService } from "architecture/typing";
import { t } from "architecture/lang";

export function Dropdown(props: DropdownType) {
  const {
    options,
    defaultValue,
    onConfirm = () => {},
    className = [],
    confirmNode = t("component_confirm"),
    confirmTooltip,
  } = props;
  const [value, setValue] = useState(defaultValue);
  return (
    <div className={c("group", ...className)}>
      <select
        onChange={(event) => {
          setValue(event.target.value);
        }}
        value={value}
      >
        {options.map(([key, label], index) => {
          return (
            <option key={`dropdown-${key}-${index}`} value={key}>
              {label}
            </option>
          );
        })}
      </select>
      <button
        title={confirmTooltip}
        onClick={() => {
          if (TypeService.isString(value)) {
            onConfirm(value);
          } else {
            const value = options[0][0];
            setValue(value);
            onConfirm(value);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            if (TypeService.isString(value)) {
              onConfirm(value);
            }
          }
        }}
      >
        {confirmNode}
      </button>
    </div>
  );
}
