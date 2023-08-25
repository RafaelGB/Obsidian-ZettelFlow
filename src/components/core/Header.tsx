import React from "react";
import { NoteBuilderProps } from "components/NoteBuilder";
import { c } from "architecture";

export function Header(props: NoteBuilderProps) {
  const { store } = props;
  const header = store((store) => store.header);
  const actions = store((store) => store.actions);
  const disablePrevious = store(
    (store) => store.section.element.key === undefined
  );
  const disableNext = store((store) => store.nextSections.size === 0);
  const { title } = header;
  return (
    <div className={c("header")}>
      <button
        placeholder={"Go to previous section"}
        hidden={disablePrevious}
        onClick={() => {
          actions.goPrevious();
        }}
      >
        {"<"}
      </button>
      <p>{title}</p>
      <button
        placeholder={"Go to next section"}
        hidden={disableNext}
        onClick={() => {
          actions.goNext();
        }}
      >
        {">"}
      </button>
    </div>
  );
}
