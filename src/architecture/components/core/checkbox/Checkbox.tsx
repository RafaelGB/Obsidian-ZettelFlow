import React, { useId, useState } from "react";
import { ConfirmStep, confirmsOn } from "../confirmStep/ConfirmStep";
import { CheckboxType } from "./typing";
import { c } from "architecture";
import { t } from "architecture/lang";

/**
 * A yes or no (#684). It used to be a bare box with nothing beside it — the step's heading was the
 * only clue to what ticking it meant. The box now carries its label, and the whole row is the
 * target: Obsidian's own checkbox, inside a `<label>`, so clicking the words ticks it too.
 */
export function Checkbox(props: CheckboxType) {
  const {
    onConfirm,
    confirmTooltip,
    label,
    hint,
    className = [],
    confirmNode = t("component_confirm"),
  } = props;

  const [value, setValue] = useState(false);
  const hintId = useId();
  return (
    <div className={c("check-step", ...className)}>
      <label className={`${c("check-row")}${value ? " is-checked" : ""}`}>
        <input
          type="checkbox"
          checked={value}
          aria-describedby={hint ? hintId : undefined}
          onChange={() => setValue(!value)}
          onKeyDown={(event) => {
            if (!confirmsOn(event)) return;
            event.preventDefault();
            onConfirm(value);
          }}
          autoFocus
        />
        <span className={c("check-text")}>
          <span className={c("check-label")}>{label}</span>
          {hint && (
            <span className={c("check-hint")} id={hintId}>
              {hint}
            </span>
          )}
        </span>
      </label>
      <ConfirmStep
        onConfirm={() => onConfirm(value)}
        tooltip={confirmTooltip}
        label={typeof confirmNode === "string" ? confirmNode : undefined}
      />
    </div>
  );
}
