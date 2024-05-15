import React from "react";
import { ProgressBarType } from "./typing";
import { useNoteBuilderStore } from "application/components/noteBuilder";
import { c } from "architecture";

export function ProgressBar(info: ProgressBarType) {
  const { label } = info;
  const value = useNoteBuilderStore((state) => state.pbElementsDone);
  const elements = useNoteBuilderStore((state) => state.pbElements);
  const elementsDone = useNoteBuilderStore((state) => state.pbElementsDone);
  return (
    <div className={c("progress-bar-container")}>
      <label htmlFor="progress-bar">
        {label} {elementsDone}/{elements}
      </label>
      <progress id="progress-bar" value={value} max={elements}>
        {value}%
      </progress>
    </div>
  );
}
