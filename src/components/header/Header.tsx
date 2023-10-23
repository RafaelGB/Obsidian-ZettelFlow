import React from "react";
import { c } from "architecture";
import { useNoteBuilderStore } from "components/noteBuilder";

export function Header() {
  const header = useNoteBuilderStore((store) => store.header);
  const actions = useNoteBuilderStore((store) => store.actions);
  const disablePrevious = useNoteBuilderStore(
    (store) => store.previousArray.length === 0
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
    </div>
  );
}
