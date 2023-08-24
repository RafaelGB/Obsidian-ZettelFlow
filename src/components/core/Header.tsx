import React from "react";
import { NoteBuilderProps } from "components/NoteBuilder";
import { c } from "architecture";

export function Header(props: NoteBuilderProps) {
  const { store } = props;
  const header = store((store) => store.header);
  const actions = store((store) => store.actions);
  const {
    title,
    previousSections,
    nextSections,
    lastSectionPlaceholder,
    nextSectionPlaceholder,
  } = header;
  return (
    <div className={c("header")}>
      <button
        placeholder={lastSectionPlaceholder}
        disabled={previousSections.length === 0}
        onClick={actions.goPrevious}
      >
        {"<"}
      </button>
      <p>{title}</p>
      <button
        placeholder={nextSectionPlaceholder}
        disabled={nextSections.length === 0}
        onClick={actions.goNext}
      >
        {">"}
      </button>
    </div>
  );
}
