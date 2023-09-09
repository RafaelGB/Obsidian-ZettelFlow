import React from "react";
import { c } from "architecture";
import { useNoteBuilderStore } from "components/NoteBuilder/state/NoteBuilderState";

export function Header() {
  const header = useNoteBuilderStore((store) => store.header);
  const actions = useNoteBuilderStore((store) => store.actions);
  const disablePrevious = useNoteBuilderStore(
    (store) => store.previousArray.length === 0
  );
  const disableNext = useNoteBuilderStore(
    (store) => store.nextArray.length === 0
  );
  const [savedPaths, savedElements, position] = useNoteBuilderStore((store) => [
    store.builder.info.getPaths().size,
    store.builder.info.getElements().size,
    store.position,
  ]);

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
      <span>{`pos: ${position} - paths: ${savedPaths} - actions: ${savedElements}`}</span>
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
