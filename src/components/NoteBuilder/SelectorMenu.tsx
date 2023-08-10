import React, { StrictMode, useState } from "react";
import { NoteBuilderProps, NoteBuilderType } from "./model/NoteBuilderModel";
import {
  Select,
  Header,
  Section,
  HeaderType,
  SectionType,
  Input,
  InputType,
} from "components/core";
import { zettelFlowOptionRecord2Options } from "components/core";
import { t } from "architecture/lang";
import { Builder, FinalNoteType } from "notes";
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
        <Component {...noteBuilderType} noteBuilderStore={noteBuilderStore} />
      </div>
    </StrictMode>
  );
}

function Component(noteBuilderType: NoteBuilderProps) {
  const { plugin, modal, noteBuilderStore } = noteBuilderType;
  const { settings } = plugin;
  const [inputState, setInput] = useState<InputType>({
    placeholder: t("note_title_placeholder"),
    type: "text",
    onChange: (event) => {
      const value = event.target.value;
      setInput({ ...inputState, value });
    },
  });

  const [finalNoteState, setFinalNote] = useState<FinalNoteType>({
    title: "No title",
    targetFolder: "/",
  });
  const actions = noteBuilderStore((store) => store.actions);
  const headerState = noteBuilderStore((store) => store.header);
  const sectionState = noteBuilderStore((store) => store.section);

  return (
    <>
      <div className={c("input-group")}>
        <Input {...inputState} />
      </div>
      <Header {...headerState} />
      <Section {...sectionState} />
    </>
  );
}
