import React from "react";
import { NoteBuilderProps } from "components/NoteBuilder";
import { c } from "architecture";

export function Header(props: NoteBuilderProps) {
  const { store } = props;
  const actions = store((store) => store.actions);
  const header = store((store) => store.header);
  const { title, lastSection, nextSection } = header;
  return (
    <div className={c("header")}>
      <button placeholder={lastSection} disabled={lastSection === undefined}>
        {"<"}
      </button>
      <p>{title}</p>
      <button placeholder={nextSection} disabled={nextSection === undefined}>
        {">"}
      </button>
    </div>
  );
}
