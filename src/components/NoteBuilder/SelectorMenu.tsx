import React, { StrictMode } from "react";
import { NoteBuilderProps, NoteBuilderType } from "./model/NoteBuilderModel";
import { Header, Section, Input } from "components/core";
import { c } from "architecture";
import { useNoteBuilderStore } from "./state/NoteBuilderState";

export function buildSelectorMenu(noteBuilderType: NoteBuilderType) {
  return <NoteBuilder {...noteBuilderType} />;
}

function NoteBuilder(noteBuilderType: NoteBuilderType) {
  const noteBuilderStore = useNoteBuilderStore(noteBuilderType);
  return (
    <StrictMode>
      <div>
        <Component {...noteBuilderType} store={noteBuilderStore} />
      </div>
    </StrictMode>
  );
}

function Component(noteBuilderType: NoteBuilderProps) {
  return (
    <>
      <div className={c("input-group")}>
        <Input {...noteBuilderType} />
      </div>
      <Header {...noteBuilderType} />
      <Section {...noteBuilderType} />
    </>
  );
}
