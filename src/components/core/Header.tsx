import React from "react";
import { c } from "architecture";
import { useNoteBuilderStore } from "components/NoteBuilder/state/NoteBuilderState";

export function Header() {
  const header = useNoteBuilderStore((store) => store.header);
  const actions = useNoteBuilderStore((store) => store.actions);
  const disablePrevious = useNoteBuilderStore((store) => store.position === 0);
  const disableNext = useNoteBuilderStore(
    (store) => store.nextSections.size === 0
  );
  const { title } = header;
  return (
    <div className={c("header")}>
      <button
        placeholder={"Go to previous section"}
        disabled={disablePrevious}
        onClick={() => {
          actions.goPrevious();
        }}
      >
        {"<"}
      </button>
      <p>{title}</p>
      <button
        placeholder={"Go to next section"}
        disabled={disableNext}
        onClick={() => {
          actions.goNext();
        }}
      >
        {">"}
      </button>
    </div>
  );
}
