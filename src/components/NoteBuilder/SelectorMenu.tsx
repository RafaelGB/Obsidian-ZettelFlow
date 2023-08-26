import React, { StrictMode } from "react";
import { NoteBuilderProps, NoteBuilderType } from "./model/NoteBuilderModel";
import { Header, Section, Input } from "components/core";
import { useNoteBuilderStore } from "./state/NoteBuilderState";
import { t } from "architecture/lang";

export function buildSelectorMenu(noteBuilderType: NoteBuilderType) {
  return <NoteBuilder {...noteBuilderType} />;
}

function NoteBuilder(noteBuilderType: NoteBuilderType) {
  const noteBuilderStore = useNoteBuilderStore();
  return (
    <StrictMode>
      <div>
        <Component {...noteBuilderType} store={noteBuilderStore} />
      </div>
    </StrictMode>
  );
}

function Component(noteBuilderType: NoteBuilderProps) {
  const { store } = noteBuilderType;
  const actions = store((store) => store.actions);
  const invalidTitle = store((store) => store.invalidTitle);
  return (
    <>
      <Input
        placeholder={t("note_title_placeholder")}
        onChange={(value) => {
          actions.setTitle(value);
          actions.setInvalidTitle(false);
        }}
        className={invalidTitle ? ["invalid"] : []}
      />
      <Header {...noteBuilderType} />
      <Section {...noteBuilderType} />
    </>
  );
}
