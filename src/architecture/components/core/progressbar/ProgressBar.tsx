import React from "react";
import { ProgressBarType } from "./typing";

export function ProgressBar(info: ProgressBarType) {
  const { useProgressBar, label } = info;
  const value = useProgressBar((state) => state.value);
  const elements = useProgressBar((state) => state.elements);
  return (
    <>
      <label htmlFor="progress-bar">{label}</label>
      <progress id="progress-bar" value={value} max={elements}>
        {value}%
      </progress>
    </>
  );
}
